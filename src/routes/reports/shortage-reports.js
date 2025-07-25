const express = require('express');
const router = express.Router();

/**
 * 不足部品レポート専用API
 * 生産計画に基づく部品不足の分析・調達支援機能
 * 
 * ベースパス: /api/reports/shortage-parts
 * 
 * エンドポイント:
 * GET /                    → 不足部品リスト（基本版）
 * GET /by-supplier         → 仕入先別不足部品サマリー  
 * GET /simple              → 不足部品リスト（簡易版）
 * GET /:part_code          → 部品別不足詳細
 */

// ==========================================
// 1. 不足部品リスト（基本版）
// GET /api/reports/shortage-parts/
// ==========================================
router.get('/', (req, res) => {
    const query = `
        SELECT 
            isc.part_code,
            p.specification as part_specification,
            p.category as part_category,
            p.supplier,
            p.unit_price,
            p.lead_time_days,
            isc.shortage_quantity,
            isc.current_stock,
            isc.total_reserved_stock,
            isc.scheduled_receipts_until_start,
            isc.available_stock,
            isc.procurement_due_date,
            isc.start_date as production_start_date,
            isc.product_code,
            isc.planned_quantity as production_quantity,
            
            -- 優先度判定（緊急度ベース）
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN '緊急'
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN '警告'
                WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN '注意'
                ELSE '通常'
            END as procurement_priority,
            
            -- 遅延日数計算
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                THEN DATEDIFF(CURDATE(), isc.procurement_due_date)
                ELSE 0
            END as overdue_days,
            
            -- 概算調達金額
            ROUND(isc.shortage_quantity * COALESCE(p.unit_price, 0), 2) as estimated_cost,
            
            -- 在庫状況詳細
            CONCAT(
                '現在:', isc.current_stock, '個 | ',
                '予約:', isc.total_reserved_stock, '個 | ',
                '予定入荷:', isc.scheduled_receipts_until_start, '個'
            ) as stock_detail
            
        FROM inventory_sufficiency_check isc
        INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE isc.shortage_quantity > 0  -- 不足がある部品のみ
        ORDER BY 
            -- 優先度順序（緊急→警告→注意→通常）
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN 1
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN 2
                WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN 3
                ELSE 4
            END,
            isc.procurement_due_date ASC,  -- 調達期限の早い順
            isc.shortage_quantity DESC     -- 不足数量の多い順
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('不足部品リスト取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // サマリー情報の計算
        const summary = {
            total_shortage_parts: results.length,
            total_estimated_cost: results.reduce((sum, item) => sum + parseFloat(item.estimated_cost || 0), 0),
            priority_breakdown: {
                emergency: results.filter(r => r.procurement_priority === '緊急').length,
                warning: results.filter(r => r.procurement_priority === '警告').length,
                caution: results.filter(r => r.procurement_priority === '注意').length,
                normal: results.filter(r => r.procurement_priority === '通常').length
            },
            max_overdue_days: Math.max(...results.map(r => r.overdue_days), 0)
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '不足部品リスト（基本版）',
                    generated_at: new Date().toISOString(),
                    description: '生産計画に基づく不足部品の一覧。調達優先度付き。'
                },
                summary: summary,
                shortage_parts: results
            }
        });
    });
});

// ==========================================
// 2. 仕入先別不足部品サマリー（重要機能）
// GET /api/reports/shortage-parts/by-supplier
// ==========================================
router.get('/by-supplier', (req, res) => {
    const query = `
        SELECT 
            p.supplier,
            COUNT(*) as shortage_parts_count,
            SUM(isc.shortage_quantity) as total_shortage_quantity,
            ROUND(SUM(isc.shortage_quantity * COALESCE(p.unit_price, 0)), 2) as total_estimated_cost,
            
            -- 優先度別集計
            COUNT(CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN 1 
            END) as emergency_parts_count,
            COUNT(CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) < 7 THEN 1 
            END) as warning_parts_count,
            
            -- 最早調達期限
            MIN(isc.procurement_due_date) as earliest_due_date,
            
            -- 最大遅延日数
            MAX(CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                THEN DATEDIFF(CURDATE(), isc.procurement_due_date)
                ELSE 0
            END) as max_overdue_days,
            
            -- 部品詳細をJSON配列で集約
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'part_code', isc.part_code,
                    'specification', p.specification,
                    'shortage_quantity', isc.shortage_quantity,
                    'procurement_due_date', isc.procurement_due_date,
                    'estimated_cost', ROUND(isc.shortage_quantity * COALESCE(p.unit_price, 0), 2),
                    'priority', CASE 
                        WHEN isc.procurement_due_date < CURDATE() 
                             AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN '緊急'
                        WHEN isc.procurement_due_date < CURDATE() 
                             AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN '警告'
                        WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN '注意'
                        ELSE '通常'
                    END
                )
            ) as parts_detail
            
        FROM inventory_sufficiency_check isc
        INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE isc.shortage_quantity > 0
        GROUP BY p.supplier
        ORDER BY 
            emergency_parts_count DESC,    -- 緊急部品が多い仕入先を優先
            total_estimated_cost DESC,     -- 金額インパクトの大きい順
            earliest_due_date ASC         -- 調達期限の早い順
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('仕入先別不足部品サマリー取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 全体サマリーの計算
        const summary = {
            total_suppliers: results.length,
            total_shortage_parts: results.reduce((sum, item) => sum + item.shortage_parts_count, 0),
            total_estimated_cost: results.reduce((sum, item) => sum + parseFloat(item.total_estimated_cost || 0), 0),
            priority_suppliers: {
                with_emergency: results.filter(r => r.emergency_parts_count > 0).length,
                with_warning: results.filter(r => r.warning_parts_count > 0).length
            }
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '仕入先別不足部品サマリー',
                    generated_at: new Date().toISOString(),
                    description: '仕入先ごとの不足部品集計。発注業務の効率化用。'
                },
                summary: summary,
                suppliers: results
            }
        });
    });
});

// ==========================================
// 3. 不足部品リスト（簡易版）
// GET /api/reports/shortage-parts/simple
// ==========================================
router.get('/simple', (req, res) => {
    const query = `
        SELECT 
            isc.part_code,
            p.specification,
            p.supplier,
            isc.shortage_quantity,
            isc.procurement_due_date,
            
            -- 優先度判定（簡易版）
            CASE 
                WHEN isc.procurement_due_date < CURDATE() THEN '期限超過'
                WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN '3日以内'
                WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 7 THEN '1週間以内'
                ELSE '余裕あり'
            END as urgency_level,
            
            -- 概算金額
            ROUND(isc.shortage_quantity * COALESCE(p.unit_price, 0), 2) as estimated_cost
            
        FROM inventory_sufficiency_check isc
        INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE isc.shortage_quantity > 0
        ORDER BY 
            isc.procurement_due_date ASC,
            isc.shortage_quantity DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('簡易不足部品リスト取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '不足部品リスト（簡易版）',
                    generated_at: new Date().toISOString(),
                    description: '不足部品の概要一覧。素早い確認用。'
                },
                total_parts: results.length,
                shortage_parts: results
            }
        });
    });
});

// ==========================================
// 4. 部品別不足詳細（パラメータ付き - 最後に定義）
// GET /api/reports/shortage-parts/:part_code
// ==========================================
router.get('/:part_code', (req, res) => {
    const partCode = req.params.part_code;

    const query = `
        SELECT 
            isc.*,
            p.specification,
            p.category,
            p.supplier,
            p.unit_price,
            p.lead_time_days,
            p.safety_stock,
            
            -- 優先度判定
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN '緊急'
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN '警告'
                WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN '注意'
                ELSE '通常'
            END as procurement_priority,
            
            -- 遅延日数
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                THEN DATEDIFF(CURDATE(), isc.procurement_due_date)
                ELSE 0
            END as overdue_days,
            
            -- 概算金額
            ROUND(isc.shortage_quantity * COALESCE(p.unit_price, 0), 2) as estimated_cost,
            
            -- 安全在庫との比較
            CASE 
                WHEN isc.available_stock < p.safety_stock THEN '安全在庫割れ'
                ELSE '安全在庫内'
            END as safety_stock_status
            
        FROM inventory_sufficiency_check isc
        INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE isc.part_code = ? AND isc.shortage_quantity > 0
    `;

    req.db.query(query, [partCode], (err, results) => {
        if (err) {
            console.error('部品別不足詳細取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された部品の不足情報が見つからないか、不足がありません',
                part_code: partCode
            });
        }

        // 予定入荷情報も追加取得
        const receiptQuery = `
            SELECT 
                order_no,
                scheduled_quantity,
                scheduled_date,
                supplier,
                status
            FROM scheduled_receipts 
            WHERE part_code = ? AND status IN ('納期回答待ち', '入荷予定')
            ORDER BY scheduled_date ASC
        `;

        req.db.query(receiptQuery, [partCode], (receiptErr, receiptResults) => {
            if (receiptErr) {
                console.error('予定入荷情報取得エラー:', receiptErr);
                // 予定入荷エラーでも部品情報は返す
            }

            res.json({
                success: true,
                data: {
                    report_info: {
                        report_type: '部品別不足詳細',
                        generated_at: new Date().toISOString(),
                        description: `部品 ${partCode} の詳細不足情報`
                    },
                    part_detail: results[0],
                    scheduled_receipts: receiptResults || []
                }
            });
        });
    });
});

module.exports = router;