const express = require('express');
const router = express.Router();

/**
 * 予定入荷レポート専用API
 * 発注・納期管理・遅延監視機能
 * 
 * ベースパス: /api/reports/scheduled-receipts
 * 
 * エンドポイント:
 * GET /                    → 予定入荷レポート（全体概要）
 * GET /pending-response    → 納期回答待ち部品リスト
 * GET /delayed             → 入荷遅延アラート
 * GET /by-supplier         → 仕入先別予定入荷サマリー
 */

// ==========================================
// 1. 予定入荷レポート（全体概要）
// GET /api/reports/scheduled-receipts/
// ==========================================
router.get('/', (req, res) => {
    const query = `
        SELECT 
            sr.id,
            sr.order_no,
            sr.part_code,
            p.specification as part_specification,
            p.category as part_category,
            p.supplier,
            p.lead_time_days,
            sr.order_quantity,
            sr.scheduled_quantity,
            sr.order_date,
            sr.requested_date,
            sr.scheduled_date,
            sr.status,
            sr.remarks,
            
            -- 納期状況の判定
            CASE 
                WHEN sr.status = '納期回答待ち' THEN '回答待ち'
                WHEN sr.status = 'キャンセル' THEN 'キャンセル済み'
                WHEN sr.status = '入荷済み' THEN '入荷完了'
                WHEN sr.scheduled_date < CURDATE() THEN '納期遅延'
                WHEN DATEDIFF(sr.scheduled_date, CURDATE()) <= 3 THEN '3日以内入荷予定'
                WHEN DATEDIFF(sr.scheduled_date, CURDATE()) <= 7 THEN '1週間以内入荷予定'
                ELSE '入荷予定'
            END as delivery_status,
            
            -- 遅延日数計算
            CASE 
                WHEN sr.status = '入荷予定' AND sr.scheduled_date < CURDATE()
                THEN DATEDIFF(CURDATE(), sr.scheduled_date)
                ELSE 0
            END as delay_days,
            
            -- 概算金額
            ROUND(COALESCE(sr.scheduled_quantity, sr.order_quantity, 0) * COALESCE(p.unit_price, 0), 2) as estimated_amount,
            
            -- リードタイム遵守状況
            CASE 
                WHEN sr.scheduled_date IS NOT NULL AND sr.order_date IS NOT NULL
                THEN DATEDIFF(sr.scheduled_date, sr.order_date)
                ELSE NULL
            END as actual_lead_time,
            
            CASE 
                WHEN sr.scheduled_date IS NOT NULL AND sr.order_date IS NOT NULL
                     AND DATEDIFF(sr.scheduled_date, sr.order_date) <= p.lead_time_days
                THEN 'リードタイム内'
                WHEN sr.scheduled_date IS NOT NULL AND sr.order_date IS NOT NULL
                     AND DATEDIFF(sr.scheduled_date, sr.order_date) > p.lead_time_days
                THEN 'リードタイム超過'
                ELSE 'リードタイム未確定'
            END as lead_time_compliance
            
        FROM scheduled_receipts sr
        INNER JOIN parts p ON sr.part_code = p.part_code
        ORDER BY 
            -- 遅延している予定入荷を最優先
            CASE 
                WHEN sr.status = '入荷予定' AND sr.scheduled_date < CURDATE() THEN 1
                WHEN sr.status = '納期回答待ち' THEN 2
                WHEN DATEDIFF(sr.scheduled_date, CURDATE()) <= 3 THEN 3
                ELSE 4
            END,
            sr.scheduled_date ASC,
            sr.order_date ASC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('予定入荷レポート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // サマリー情報の計算
        const summary = {
            total_orders: results.length,
            total_estimated_amount: results.reduce((sum, item) => sum + parseFloat(item.estimated_amount || 0), 0),
            status_breakdown: {
                waiting_response: results.filter(r => r.status === '納期回答待ち').length,
                scheduled: results.filter(r => r.status === '入荷予定').length,
                received: results.filter(r => r.status === '入荷済み').length,
                cancelled: results.filter(r => r.status === 'キャンセル').length
            },
            delivery_issues: {
                delayed_orders: results.filter(r => r.delivery_status === '納期遅延').length,
                max_delay_days: Math.max(...results.map(r => r.delay_days), 0),
                urgent_orders: results.filter(r => r.delivery_status === '3日以内入荷予定').length
            },
            lead_time_analysis: {
                compliant_orders: results.filter(r => r.lead_time_compliance === 'リードタイム内').length,
                exceeded_orders: results.filter(r => r.lead_time_compliance === 'リードタイム超過').length,
                pending_orders: results.filter(r => r.lead_time_compliance === 'リードタイム未確定').length
            }
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '予定入荷レポート（全体概要）',
                    generated_at: new Date().toISOString(),
                    description: '全ての予定入荷の状況一覧。納期管理・遅延監視用。'
                },
                summary: summary,
                scheduled_receipts: results
            }
        });
    });
});

// ==========================================
// 2. 納期回答待ち部品リスト
// GET /api/reports/scheduled-receipts/pending-response
// ==========================================
router.get('/pending-response', (req, res) => {
    const query = `
        SELECT 
            sr.order_no,
            sr.part_code,
            p.specification as part_specification,
            p.supplier,
            sr.order_quantity,
            sr.order_date,
            sr.requested_date,
            
            -- 発注からの経過日数
            DATEDIFF(CURDATE(), sr.order_date) as days_since_order,
            
            -- 要求納期までの残り日数
            CASE 
                WHEN sr.requested_date IS NOT NULL
                THEN DATEDIFF(sr.requested_date, CURDATE())
                ELSE NULL
            END as days_until_requested,
            
            -- 緊急度判定
            CASE 
                WHEN sr.requested_date IS NOT NULL AND sr.requested_date < CURDATE()
                THEN '要求納期超過'
                WHEN sr.requested_date IS NOT NULL AND DATEDIFF(sr.requested_date, CURDATE()) <= 7
                THEN '緊急回答必要'
                WHEN DATEDIFF(CURDATE(), sr.order_date) >= 7
                THEN '長期回答待ち'
                ELSE '通常'
            END as urgency_level,
            
            -- 概算金額
            ROUND(sr.order_quantity * COALESCE(p.unit_price, 0), 2) as estimated_amount,
            
            sr.remarks
            
        FROM scheduled_receipts sr
        INNER JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.status = '納期回答待ち'
        ORDER BY 
            -- 緊急度順
            CASE 
                WHEN sr.requested_date IS NOT NULL AND sr.requested_date < CURDATE() THEN 1
                WHEN sr.requested_date IS NOT NULL AND DATEDIFF(sr.requested_date, CURDATE()) <= 7 THEN 2
                WHEN DATEDIFF(CURDATE(), sr.order_date) >= 7 THEN 3
                ELSE 4
            END,
            sr.requested_date ASC,
            sr.order_date ASC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('納期回答待ちリスト取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // サマリー情報
        const summary = {
            total_pending_orders: results.length,
            total_estimated_amount: results.reduce((sum, item) => sum + parseFloat(item.estimated_amount || 0), 0),
            urgency_breakdown: {
                overdue: results.filter(r => r.urgency_level === '要求納期超過').length,
                urgent: results.filter(r => r.urgency_level === '緊急回答必要').length,
                long_waiting: results.filter(r => r.urgency_level === '長期回答待ち').length,
                normal: results.filter(r => r.urgency_level === '通常').length
            },
            avg_waiting_days: results.length > 0 
                ? Math.round(results.reduce((sum, item) => sum + item.days_since_order, 0) / results.length)
                : 0
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '納期回答待ち部品リスト',
                    generated_at: new Date().toISOString(),
                    description: '仕入先からの納期回答を待っている発注の一覧。フォローアップ用。'
                },
                summary: summary,
                pending_orders: results
            }
        });
    });
});

// ==========================================
// 3. 入荷遅延アラート
// GET /api/reports/scheduled-receipts/delayed
// ==========================================
router.get('/delayed', (req, res) => {
    const query = `
        SELECT 
            sr.order_no,
            sr.part_code,
            p.specification as part_specification,
            p.supplier,
            p.category as part_category,
            sr.scheduled_quantity,
            sr.scheduled_date,
            sr.order_date,
            
            -- 遅延日数
            DATEDIFF(CURDATE(), sr.scheduled_date) as delay_days,
            
            -- 遅延レベル
            CASE 
                WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 30 THEN '重大遅延'
                WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 14 THEN '大幅遅延'
                WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 7 THEN '中程度遅延'
                WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 1 THEN '軽微遅延'
                ELSE '遅延なし'
            END as delay_level,
            
            -- 概算影響金額
            ROUND(sr.scheduled_quantity * COALESCE(p.unit_price, 0), 2) as impact_amount,
            
            -- 生産への影響確認
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM inventory_sufficiency_check isc 
                    WHERE isc.part_code = sr.part_code 
                    AND isc.shortage_quantity > 0
                    AND isc.procurement_due_date <= CURDATE()
                ) THEN '生産影響あり'
                WHEN EXISTS (
                    SELECT 1 FROM inventory_sufficiency_check isc 
                    WHERE isc.part_code = sr.part_code 
                    AND isc.shortage_quantity > 0
                ) THEN '生産影響可能性'
                ELSE '生産影響なし'
            END as production_impact,
            
            sr.remarks
            
        FROM scheduled_receipts sr
        INNER JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.status = '入荷予定' 
        AND sr.scheduled_date < CURDATE()
        ORDER BY 
            delay_days DESC,  -- 遅延日数の多い順
            impact_amount DESC -- 影響金額の大きい順
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('入荷遅延アラート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // サマリー情報
        const summary = {
            total_delayed_orders: results.length,
            total_impact_amount: results.reduce((sum, item) => sum + parseFloat(item.impact_amount || 0), 0),
            delay_level_breakdown: {
                critical: results.filter(r => r.delay_level === '重大遅延').length,
                major: results.filter(r => r.delay_level === '大幅遅延').length,
                moderate: results.filter(r => r.delay_level === '中程度遅延').length,
                minor: results.filter(r => r.delay_level === '軽微遅延').length
            },
            production_impact_analysis: {
                confirmed_impact: results.filter(r => r.production_impact === '生産影響あり').length,
                potential_impact: results.filter(r => r.production_impact === '生産影響可能性').length,
                no_impact: results.filter(r => r.production_impact === '生産影響なし').length
            },
            max_delay_days: results.length > 0 ? Math.max(...results.map(r => r.delay_days)) : 0,
            suppliers_affected: [...new Set(results.map(r => r.supplier))].length
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '入荷遅延アラート',
                    generated_at: new Date().toISOString(),
                    description: '予定日を過ぎても入荷していない発注の一覧。緊急対応用。'
                },
                summary: summary,
                delayed_orders: results
            }
        });
    });
});

// ==========================================
// 4. 仕入先別予定入荷サマリー
// GET /api/reports/scheduled-receipts/by-supplier
// ==========================================
router.get('/by-supplier', (req, res) => {
    const query = `
        SELECT 
            p.supplier,
            COUNT(*) as total_orders,
            COUNT(CASE WHEN sr.status = '納期回答待ち' THEN 1 END) as pending_response_count,
            COUNT(CASE WHEN sr.status = '入荷予定' THEN 1 END) as scheduled_count,
            COUNT(CASE WHEN sr.status = '入荷予定' AND sr.scheduled_date < CURDATE() THEN 1 END) as delayed_count,
            
            -- 金額集計
            ROUND(SUM(COALESCE(sr.scheduled_quantity, sr.order_quantity, 0) * COALESCE(p.unit_price, 0)), 2) as total_amount,
            
            -- 最早予定日
            MIN(CASE WHEN sr.status = '入荷予定' THEN sr.scheduled_date END) as earliest_scheduled_date,
            
            -- 最大遅延日数
            MAX(CASE 
                WHEN sr.status = '入荷予定' AND sr.scheduled_date < CURDATE()
                THEN DATEDIFF(CURDATE(), sr.scheduled_date)
                ELSE 0
            END) as max_delay_days,
            
            -- 発注詳細をJSON配列で集約
            JSON_ARRAYAGG(
                JSON_OBJECT(
                    'order_no', sr.order_no,
                    'part_code', sr.part_code,
                    'specification', p.specification,
                    'status', sr.status,
                    'scheduled_date', sr.scheduled_date,
                    'delay_days', CASE 
                        WHEN sr.status = '入荷予定' AND sr.scheduled_date < CURDATE()
                        THEN DATEDIFF(CURDATE(), sr.scheduled_date)
                        ELSE 0
                    END
                )
            ) as orders_detail
            
        FROM scheduled_receipts sr
        INNER JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.status IN ('納期回答待ち', '入荷予定')
        GROUP BY p.supplier
        ORDER BY 
            delayed_count DESC,        -- 遅延発注が多い仕入先を優先
            pending_response_count DESC, -- 回答待ちが多い仕入先を優先
            total_amount DESC          -- 金額インパクトの大きい順
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('仕入先別予定入荷サマリー取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 全体サマリー
        const summary = {
            total_suppliers: results.length,
            total_orders: results.reduce((sum, item) => sum + item.total_orders, 0),
            total_amount: results.reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0),
            issues_summary: {
                suppliers_with_delays: results.filter(r => r.delayed_count > 0).length,
                suppliers_with_pending: results.filter(r => r.pending_response_count > 0).length,
                total_delayed_orders: results.reduce((sum, item) => sum + item.delayed_count, 0),
                total_pending_orders: results.reduce((sum, item) => sum + item.pending_response_count, 0)
            }
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '仕入先別予定入荷サマリー',
                    generated_at: new Date().toISOString(),
                    description: '仕入先ごとの予定入荷状況。仕入先管理・フォローアップ用。'
                },
                summary: summary,
                suppliers: results
            }
        });
    });
});

module.exports = router;