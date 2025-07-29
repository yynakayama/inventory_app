// ==========================================
// 利用可能在庫計算API
// ファイル: src/routes/available-inventory.js
// 目的: 現在在庫 + 予定入荷 - 予約済み在庫 = 利用可能在庫の計算
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireReadAccess } = require('../middleware/auth');

const router = express.Router();

// データベース接続設定
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'inventory_db',
    charset: 'utf8mb4'
};

// ==========================================
// 1. 全部品の利用可能在庫一覧取得
// GET /api/available-inventory
// 権限: 全ユーザー（認証必須）
// 目的: 全部品の利用可能在庫状況を一覧取得
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { as_of_date, include_negative = 'true' } = req.query;
        
        // 基準日の設定（省略時は今日）
        const baseDate = as_of_date || new Date().toISOString().split('T')[0];
        
        // 日付形式の検証
        if (!/^\d{4}-\d{2}-\d{2}$/.test(baseDate)) {
            return res.status(400).json({
                success: false,
                message: '日付形式が正しくありません。YYYY-MM-DD形式で入力してください',
                error: 'INVALID_DATE_FORMAT',
                example: '2025-07-28'
            });
        }

        console.log(`[${new Date().toISOString()}] 📊 利用可能在庫一覧取得開始: ユーザー=${req.user.username}, 基準日=${baseDate}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        /**
         * 計算式: 利用可能在庫 = 現在在庫 + 入荷予定 - 予約済み在庫
         * 
         * JOIN構造:
         * - inventory (メイン): 在庫管理テーブル
         * - parts: 部品詳細情報
         * - scheduled_receipts: 予定入荷（基準日まで）
         */
        let query = `
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
                ) AS available_stock,
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
                END AS stock_status
            FROM inventory i
            LEFT JOIN parts p ON i.part_code = p.part_code
            LEFT JOIN scheduled_receipts sr ON i.part_code = sr.part_code
            WHERE p.is_active = TRUE
            GROUP BY 
                i.part_code, p.specification, p.unit, p.safety_stock, 
                p.lead_time_days, p.supplier, i.current_stock, i.reserved_stock
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

        const params = [baseDate, baseDate, baseDate];
        const [results] = await connection.execute(query, params);

        // サマリー情報の作成
        const summary = {
            total_parts: results.length,
            shortage_parts: results.filter(r => r.stock_status === 'SHORTAGE').length,
            ok_parts: results.filter(r => r.stock_status === 'OK').length,
            as_of_date: baseDate,
            include_negative: include_negative === 'true'
        };

        // レスポンスデータの整形
        const parts = results.map(row => ({
            part_code: row.part_code,
            specification: row.specification,
            unit: row.unit,
            supplier: row.supplier,
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
        }));

        console.log(`✅ 利用可能在庫一覧取得完了: ${results.length}件（不足: ${summary.shortage_parts}件）`);

        res.json({
            success: true,
            data: {
                summary,
                parts
            },
            message: `利用可能在庫を${results.length}件取得しました（基準日: ${baseDate}）`
        });

    } catch (error) {
        console.error('❌ 利用可能在庫一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '利用可能在庫の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 特定部品の利用可能在庫詳細取得
// GET /api/available-inventory/:part_code
// 権限: 全ユーザー（認証必須）
// 目的: 指定部品の詳細な在庫情報（予定入荷明細、履歴等）
// ==========================================
router.get('/:part_code', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { as_of_date } = req.query;
        
        // 基準日の設定
        const baseDate = as_of_date || new Date().toISOString().split('T')[0];

        console.log(`[${new Date().toISOString()}] 🔍 部品別在庫詳細取得開始: ユーザー=${req.user.username}, 部品=${part_code}`);
        
        connection = await mysql.createConnection(dbConfig);

        // 1. 基本的な在庫情報取得
        const inventoryQuery = `
            SELECT 
                i.part_code,
                p.specification,
                p.unit,
                p.safety_stock,
                p.lead_time_days,
                p.supplier,
                p.category,
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
                p.lead_time_days, p.supplier, p.category, i.current_stock, i.reserved_stock
        `;

        const [inventoryResults] = await connection.execute(inventoryQuery, [baseDate, baseDate, part_code]);

        if (inventoryResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された部品コードが見つかりません',
                error: 'PART_NOT_FOUND',
                part_code: part_code
            });
        }

        const inventoryData = inventoryResults[0];

        // 2. 予定入荷の詳細取得
        const receiptsQuery = `
            SELECT 
                id,
                order_no,
                supplier,
                order_quantity,
                scheduled_quantity,
                scheduled_date,
                status,
                order_date,
                requested_date,
                remarks
            FROM scheduled_receipts 
            WHERE part_code = ? 
                AND status IN ('納期回答待ち', '入荷予定')
            ORDER BY 
                CASE status 
                    WHEN '納期回答待ち' THEN 1 
                    WHEN '入荷予定' THEN 2 
                END,
                COALESCE(scheduled_date, requested_date, '9999-12-31') ASC
        `;

        const [receiptsResults] = await connection.execute(receiptsQuery, [part_code]);

        // 3. 最近の在庫変動履歴取得（直近10件）
        const transactionQuery = `
            SELECT 
                transaction_type,
                quantity,
                before_stock,
                after_stock,
                transaction_date,
                reference_type,
                remarks,
                created_by
            FROM inventory_transactions 
            WHERE part_code = ? 
            ORDER BY transaction_date DESC, id DESC
        `;

        // LIMIT句は動的パラメータを避けて直接埋め込み
        const limitedTransactionQuery = transactionQuery + ' LIMIT 10';
        const [transactionResults] = await connection.execute(limitedTransactionQuery, [part_code]);

        // 4. 発注推奨計算
        const shouldOrder = inventoryData.available_stock < inventoryData.safety_stock;
        const recommendedOrderQuantity = shouldOrder 
            ? Math.max(0, inventoryData.safety_stock * 2 - inventoryData.available_stock)
            : 0;

        // 5. 在庫リスク評価
        let stockoutRisk = 'LOW';
        if (inventoryData.available_stock < 0) {
            stockoutRisk = 'HIGH';
        } else if (inventoryData.available_stock < inventoryData.safety_stock) {
            stockoutRisk = 'MEDIUM';
        }

        // レスポンスデータの構築
        const responseData = {
            part_info: {
                part_code: inventoryData.part_code,
                specification: inventoryData.specification,
                unit: inventoryData.unit,
                category: inventoryData.category,
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
                stockout_risk: stockoutRisk
            },
            scheduled_receipts: receiptsResults,
            recent_transactions: transactionResults
        };

        console.log(`✅ 部品別在庫詳細取得完了: ${part_code} (利用可能在庫: ${inventoryData.available_stock})`);

        res.json({
            success: true,
            data: responseData,
            message: `部品 ${part_code} の詳細情報を取得しました`
        });

    } catch (error) {
        console.error('❌ 部品別在庫詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品別在庫詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. 在庫充足性の一括チェック
// POST /api/available-inventory/check-sufficiency
// 権限: 全ユーザー（認証必須）
// 目的: 複数部品の必要数量に対する充足性を一括チェック
// ==========================================
router.post('/check-sufficiency', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { required_parts, required_date } = req.body;
        
        // 入力データの検証
        if (!required_parts || !Array.isArray(required_parts) || required_parts.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'required_parts配列が必要です',
                error: 'INVALID_INPUT',
                example: {
                    required_parts: [
                        {"part_code": "SUS304-M6-20-HEX", "required_quantity": 100}
                    ],
                    required_date: "2025-08-15"
                }
            });
        }

        // 各部品の必要数量検証
        for (const part of required_parts) {
            if (!part.part_code || typeof part.required_quantity !== 'number' || part.required_quantity < 0) {
                return res.status(400).json({
                    success: false,
                    message: '部品コードまたは必要数量が無効です',
                    error: 'INVALID_PART_DATA',
                    invalid_part: part
                });
            }
        }

        // 必要日の設定（省略時は今日）
        const checkDate = required_date || new Date().toISOString().split('T')[0];
        
        console.log(`[${new Date().toISOString()}] 🔍 在庫充足性一括チェック開始: ユーザー=${req.user.username}, 対象=${required_parts.length}件`);
        
        connection = await mysql.createConnection(dbConfig);
        
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
                p.unit,
                p.safety_stock,
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
            GROUP BY i.part_code, p.specification, p.unit, p.safety_stock, i.current_stock, i.reserved_stock
        `;

        const params = [checkDate, checkDate, ...partCodes];
        const [results] = await connection.execute(query, params);

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
                unit: stockData.unit,
                required_quantity: reqPart.required_quantity,
                available_stock: stockData.available_stock,
                shortage_quantity: Math.max(0, shortage),
                status: isSufficient ? 'SUFFICIENT' : 'SHORTAGE',
                details: {
                    current_stock: stockData.current_stock,
                    scheduled_receipts: stockData.scheduled_receipts,
                    reserved_stock: stockData.reserved_stock,
                    safety_stock: stockData.safety_stock
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

        console.log(`✅ 在庫充足性チェック完了: 充足=${summary.sufficient_parts}件, 不足=${summary.shortage_parts}件, エラー=${summary.error_parts}件`);

        res.json({
            success: true,
            data: {
                summary,
                results: sufficiencyResults
            },
            message: `在庫充足性チェックが完了しました（${summary.total_parts}件中 充足: ${summary.sufficient_parts}件、不足: ${summary.shortage_parts}件）`
        });

    } catch (error) {
        console.error('❌ 在庫充足性チェックエラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫充足性チェック中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;