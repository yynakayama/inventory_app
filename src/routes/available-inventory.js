const express = require('express');
const router = express.Router();

/**
 * 利用可能在庫計算API（統一版）
 * 
 * 計算式: 利用可能在庫 = 現在在庫 + 入荷予定 - 予約済み在庫
 * 
 */

/**
 * 1. 全部品の利用可能在庫一覧取得
 * GET /api/available-inventory
 * 
 * クエリパラメータ:
 * - as_of_date: 基準日（YYYY-MM-DD形式、省略時は今日）
 * - include_negative: 負の在庫も含むか（true/false、デフォルト: true）
 */
router.get('/', (req, res) => {
    // クエリパラメータの取得と検証
    const { as_of_date, include_negative = 'true' } = req.query;
    
    // 基準日の設定（省略時は今日）
    const baseDate = as_of_date || new Date().toISOString().split('T')[0];
    
    // 日付形式の簡易バリデーション
    if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) {
        return res.status(400).json({ 
            error: '日付形式が正しくありません。YYYY-MM-DD形式で入力してください。',
            example: '2024-07-23'
        });
    }

    /**
     * 1. メインテーブル: inventory (在庫管理)
     * 2. JOIN1: parts (部品マスタ) - 部品名などの詳細情報取得
     * 3. JOIN2: scheduled_receipts (予定入荷) - 集計が必要なため LEFT JOIN
     * 
     * GROUP BY の理由:
     * - scheduled_receipts は 1つの部品に対して複数レコードの可能性
     * - SUM() で予定入荷の合計を計算
     * 
     * COALESCE の役割:
     * - LEFT JOIN で該当データがない場合、NULL になる
     * - NULL + 数値 = NULL になるため、0 に変換
     */
    let query = `
        SELECT 
            i.part_code,
            p.specification,
            p.unit,
            p.safety_stock,
            p.lead_time_days,
            i.current_stock,
            i.reserved_stock,
            COALESCE(SUM(
                CASE 
                    WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                    THEN sr.scheduled_quantity 
                    ELSE 0 
                END
            ), 0) AS scheduled_receipts,
            (
                i.current_stock + 
                COALESCE(SUM(
                    CASE 
                        WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                        THEN sr.scheduled_quantity 
                        ELSE 0 
                    END
                ), 0) - 
                i.reserved_stock
            ) AS available_stock,
            -- 安全在庫を下回っているかの判定
            CASE 
                WHEN (
                    i.current_stock + 
                    COALESCE(SUM(
                        CASE 
                            WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                            THEN sr.scheduled_quantity 
                            ELSE 0 
                        END
                    ), 0) - 
                    i.reserved_stock
                ) < p.safety_stock 
                THEN 'SHORTAGE' 
                ELSE 'OK' 
            END AS stock_status,
            -- 基準日
            ? AS as_of_date
        FROM inventory i
        LEFT JOIN parts p ON i.part_code = p.part_code
        LEFT JOIN scheduled_receipts sr ON i.part_code = sr.part_code
        WHERE p.is_active = TRUE
        GROUP BY 
            i.part_code, 
            p.specification, 
            p.unit, 
            p.safety_stock, 
            p.lead_time_days,
            i.current_stock, 
            i.reserved_stock
    `;

    // 負の在庫を除外するかどうか
    if (include_negative === 'false') {
        query += ` HAVING available_stock >= 0`;
    }

    query += `
        ORDER BY 
            stock_status DESC,  -- SHORTAGE を先に表示
            available_stock ASC -- 在庫少ない順
    `;

    // パラメータは同じ値を複数回使用するため配列で指定
    const params = [
        baseDate,  // scheduled_receipts の日付条件1
        baseDate,  // scheduled_receipts の日付条件2  
        baseDate,  // scheduled_receipts の日付条件3
        baseDate   // as_of_date 表示用
    ];

    req.db.query(query, params, (err, results) => {
        if (err) {
            console.error('利用可能在庫一覧取得エラー:', err.message);
            res.status(500).json({ 
                error: 'サーバーエラーが発生しました',
                details: err.message 
            });
            return;
        }

        // レスポンス用のデータ整形
        const responseData = {
            summary: {
                total_parts: results.length,
                shortage_parts: results.filter(r => r.stock_status === 'SHORTAGE').length,
                as_of_date: baseDate,
                include_negative: include_negative === 'true'
            },
            parts: results.map(row => ({
                part_code: row.part_code,
                specification: row.specification,
                unit: row.unit,
                inventory: {
                    current_stock: row.current_stock,
                    reserved_stock: row.reserved_stock,
                    scheduled_receipts: row.scheduled_receipts,
                    available_stock: row.available_stock,
                    safety_stock: row.safety_stock
                },
                status: {
                    stock_status: row.stock_status,
                    lead_time_days: row.lead_time_days
                }
            }))
        };

        res.json(responseData);
    });
});

/**
 * 2. 特定部品の利用可能在庫詳細取得
 * GET /api/available-inventory/:part_code
 * 
 * より詳細な情報を提供:
 * - 予定入荷の明細表示
 * - 在庫推移の予測
 * - 発注推奨情報
 */
router.get('/:part_code', (req, res) => {
    const { part_code } = req.params;
    const { as_of_date } = req.query;
    
    // 基準日の設定
    const baseDate = as_of_date || new Date().toISOString().split('T')[0];

    // 1. 基本的な在庫情報取得
    const inventoryQuery = `
        SELECT 
            i.part_code,
            p.specification,
            p.unit,
            p.safety_stock,
            p.lead_time_days,
            p.supplier,
            i.current_stock,
            i.reserved_stock,
            COALESCE(SUM(
                CASE 
                    WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                    THEN sr.scheduled_quantity 
                    ELSE 0 
                END
            ), 0) AS scheduled_receipts,
            (
                i.current_stock + 
                COALESCE(SUM(
                    CASE 
                        WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                        THEN sr.scheduled_quantity 
                        ELSE 0 
                    END
                ), 0) - 
                i.reserved_stock
            ) AS available_stock
        FROM inventory i
        LEFT JOIN parts p ON i.part_code = p.part_code
        LEFT JOIN scheduled_receipts sr ON i.part_code = sr.part_code
        WHERE i.part_code = ?
        GROUP BY 
            i.part_code, p.specification, p.unit, p.safety_stock, 
            p.lead_time_days, p.supplier, i.current_stock, i.reserved_stock
    `;

    req.db.query(inventoryQuery, [baseDate, baseDate, part_code], (err, inventoryResults) => {
        if (err) {
            console.error('在庫情報取得エラー:', err.message);
            res.status(500).json({ 
                error: 'サーバーエラーが発生しました',
                details: err.message 
            });
            return;
        }

        if (inventoryResults.length === 0) {
            return res.status(404).json({ 
                error: '指定された部品コードが見つかりません',
                part_code: part_code 
            });
        }

        const inventoryData = inventoryResults[0];

        // 2. 予定入荷の詳細取得
        const receiptsQuery = `
            SELECT 
                order_no,
                supplier,
                scheduled_quantity,
                scheduled_date,
                status,
                order_date,
                remarks
            FROM scheduled_receipts 
            WHERE part_code = ? 
                AND status IN ('納期回答待ち', '入荷予定')
            ORDER BY 
                CASE status 
                    WHEN '納期回答待ち' THEN 1 
                    WHEN '入荷予定' THEN 2 
                END,
                scheduled_date ASC
        `;

        req.db.query(receiptsQuery, [part_code], (err, receiptsResults) => {
            if (err) {
                console.error('予定入荷取得エラー:', err.message);
                res.status(500).json({ 
                    error: '予定入荷情報の取得に失敗しました',
                    details: err.message 
                });
                return;
            }

            // 3. 最近の在庫変動履歴取得（直近10件）
            const transactionQuery = `
                SELECT 
                    transaction_type,
                    quantity,
                    before_stock,
                    after_stock,
                    transaction_date,
                    remarks
                FROM inventory_transactions 
                WHERE part_code = ? 
                ORDER BY transaction_date DESC 
                LIMIT 10
            `;

            req.db.query(transactionQuery, [part_code], (err, transactionResults) => {
                if (err) {
                    console.error('在庫履歴取得エラー:', err.message);
                    res.status(500).json({ 
                        error: '在庫履歴の取得に失敗しました',
                        details: err.message 
                    });
                    return;
                }

                // 4. 発注推奨計算
                const shouldOrder = inventoryData.available_stock < inventoryData.safety_stock;
                const recommendedOrderQuantity = shouldOrder 
                    ? inventoryData.safety_stock * 2 - inventoryData.available_stock 
                    : 0;

                // レスポンスデータの構築
                const responseData = {
                    part_info: {
                        part_code: inventoryData.part_code,
                        specification: inventoryData.specification,
                        unit: inventoryData.unit,
                        supplier: inventoryData.supplier,
                        lead_time_days: inventoryData.lead_time_days
                    },
                    inventory_calculation: {
                        as_of_date: baseDate,
                        current_stock: inventoryData.current_stock,
                        reserved_stock: inventoryData.reserved_stock,
                        scheduled_receipts: inventoryData.scheduled_receipts,
                        available_stock: inventoryData.available_stock,
                        safety_stock: inventoryData.safety_stock,
                        calculation_formula: `${inventoryData.current_stock} + ${inventoryData.scheduled_receipts} - ${inventoryData.reserved_stock} = ${inventoryData.available_stock}`
                    },
                    status_analysis: {
                        stock_status: inventoryData.available_stock >= inventoryData.safety_stock ? 'OK' : 'SHORTAGE',
                        should_order: shouldOrder,
                        recommended_order_quantity: recommendedOrderQuantity,
                        estimated_stockout_risk: inventoryData.available_stock < 0 ? 'HIGH' : 
                                               inventoryData.available_stock < inventoryData.safety_stock ? 'MEDIUM' : 'LOW'
                    },
                    scheduled_receipts: receiptsResults,
                    recent_transactions: transactionResults
                };

                res.json(responseData);
            });
        });
    });
});

/**
 * 3. 在庫充足性の一括チェック
 * POST /api/available-inventory/check-sufficiency
 * 
 * 複数部品の必要数量に対する充足性を一括チェック
 * 
 * リクエストボディ例:
 * {
 *   "required_parts": [
 *     {"part_code": "SUS304-M6-20-HEX", "required_quantity": 100},
 *     {"part_code": "POM-CASE-001", "required_quantity": 50}
 *   ],
 *   "required_date": "2024-08-15"
 * }
 */
router.post('/check-sufficiency', (req, res) => {
    const { required_parts, required_date } = req.body;
    
    // 入力データの検証
    if (!required_parts || !Array.isArray(required_parts) || required_parts.length === 0) {
        return res.status(400).json({ 
            error: 'required_parts配列が必要です',
            example: {
                required_parts: [
                    {"part_code": "SUS304-M6-20-HEX", "required_quantity": 100}
                ]
            }
        });
    }

    // 必要日の設定（省略時は今日）
    const checkDate = required_date || new Date().toISOString().split('T')[0];
    
    // 部品コードリストの作成
    const partCodes = required_parts.map(p => p.part_code);
    const placeholders = partCodes.map(() => '?').join(',');

    /**
     * IN句を使った複数部品の一括取得
     * パフォーマンスを考慮した設計
     */
    const query = `
        SELECT 
            i.part_code,
            p.specification,
            i.current_stock,
            i.reserved_stock,
            COALESCE(SUM(
                CASE 
                    WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                    THEN sr.scheduled_quantity 
                    ELSE 0 
                END
            ), 0) AS scheduled_receipts,
            (
                i.current_stock + 
                COALESCE(SUM(
                    CASE 
                        WHEN sr.status = '入荷予定' AND sr.scheduled_date <= ? 
                        THEN sr.scheduled_quantity 
                        ELSE 0 
                    END
                ), 0) - 
                i.reserved_stock
            ) AS available_stock
        FROM inventory i
        LEFT JOIN parts p ON i.part_code = p.part_code
        LEFT JOIN scheduled_receipts sr ON i.part_code = sr.part_code
        WHERE i.part_code IN (${placeholders})
        GROUP BY i.part_code, p.specification, i.current_stock, i.reserved_stock
    `;

    const params = [checkDate, checkDate, ...partCodes];

    req.db.query(query, params, (err, results) => {
        if (err) {
            console.error('在庫充足性チェックエラー:', err.message);
            res.status(500).json({ 
                error: 'サーバーエラーが発生しました',
                details: err.message 
            });
            return;
        }

        // 結果の整理と充足性判定
        const sufficiencyResults = required_parts.map(reqPart => {
            const stockData = results.find(r => r.part_code === reqPart.part_code);
            
            if (!stockData) {
                return {
                    part_code: reqPart.part_code,
                    required_quantity: reqPart.required_quantity,
                    status: 'ERROR',
                    message: '部品コードが見つかりません'
                };
            }

            const shortage = reqPart.required_quantity - stockData.available_stock;
            const isSufficient = shortage <= 0;

            return {
                part_code: reqPart.part_code,
                specification: stockData.specification,
                required_quantity: reqPart.required_quantity,
                available_stock: stockData.available_stock,
                shortage_quantity: Math.max(0, shortage),
                status: isSufficient ? 'SUFFICIENT' : 'SHORTAGE',
                details: {
                    current_stock: stockData.current_stock,
                    scheduled_receipts: stockData.scheduled_receipts,
                    reserved_stock: stockData.reserved_stock
                }
            };
        });

        // サマリー情報の作成
        const summary = {
            check_date: checkDate,
            total_parts: required_parts.length,
            sufficient_parts: sufficiencyResults.filter(r => r.status === 'SUFFICIENT').length,
            shortage_parts: sufficiencyResults.filter(r => r.status === 'SHORTAGE').length,
            error_parts: sufficiencyResults.filter(r => r.status === 'ERROR').length,
            overall_status: sufficiencyResults.every(r => r.status === 'SUFFICIENT') ? 'ALL_SUFFICIENT' : 'HAS_SHORTAGE'
        };

        res.json({
            summary,
            results: sufficiencyResults
        });
    });
});

module.exports = router;