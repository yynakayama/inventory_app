const express = require('express');
const router = express.Router();

/**
 * 調達アラート機能API
 * 
 * 機能概要:
 * - 発注期限超過アラート（調達必要日ベース）
 * - 予定入荷遅延アラート（予定入荷日ベース）
 * - 在庫不足アラート（shortage_quantity > 0）
 * - アラートサマリー（緊急・警告の件数集計）
 * 
 * 優先度判定:
 * - 緊急: 遅延日数 ≥ 7日
 * - 警告: 遅延日数 1-6日
 */

// ==========================================
// 1. 発注期限超過アラート
// ==========================================
router.get('/overdue-orders', (req, res) => {
    console.log('🚨 発注期限超過アラート取得開始');
    
    const query = `
        SELECT 
            isc.plan_id,
            isc.product_code,
            isc.part_code,
            p.specification as part_specification,
            p.supplier,
            isc.required_quantity,
            isc.current_stock,
            isc.scheduled_receipts_until_start,
            isc.available_stock,
            isc.shortage_quantity,
            isc.procurement_due_date,
            isc.start_date as production_start_date,
            isc.lead_time_days,
            
            -- 現在日付との比較
            CURDATE() as current_date_value,
            
            -- 遅延日数計算（procurement_due_date < 現在日付の場合）
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                THEN DATEDIFF(CURDATE(), isc.procurement_due_date)
                ELSE 0
            END as overdue_days,
            
            -- 優先度判定（緊急: ≥7日, 警告: 1-6日）
            CASE 
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7
                THEN '緊急'
                WHEN isc.procurement_due_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1
                THEN '警告'
                ELSE NULL
            END as alert_priority,
            
            -- アラート種別
            '発注期限超過' as alert_type
            
        FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE 
            isc.shortage_quantity > 0  -- 不足している部品のみ
            AND isc.procurement_due_date < CURDATE()  -- 調達期限超過
            AND p.is_active = TRUE
        ORDER BY 
            -- 緊急度順 → 遅延日数順 → 不足数量順
            CASE 
                WHEN DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN 1
                ELSE 2
            END,
            DATEDIFF(CURDATE(), isc.procurement_due_date) DESC,
            isc.shortage_quantity DESC
    `;
    
    req.db.query(query, (err, results) => {
        if (err) {
            console.error('❌ 発注期限超過アラート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: '発注期限超過アラートの取得に失敗しました',
                error: err.message
            });
        }
        
        // 優先度別に分類
        const urgent_alerts = results.filter(item => item.alert_priority === '緊急');
        const warning_alerts = results.filter(item => item.alert_priority === '警告');
        
        console.log(`✅ 発注期限超過アラート取得完了: 緊急${urgent_alerts.length}件, 警告${warning_alerts.length}件`);
        
        res.json({
            success: true,
            data: {
                urgent_alerts,
                warning_alerts,
                summary: {
                    total_count: results.length,
                    urgent_count: urgent_alerts.length,
                    warning_count: warning_alerts.length
                }
            }
        });
    });
});

// ==========================================
// 2. 予定入荷遅延アラート
// ==========================================
router.get('/delayed-receipts', (req, res) => {
    console.log('📦 予定入荷遅延アラート取得開始');
    
    const query = `
        SELECT 
            sr.id as receipt_id,
            sr.order_no,
            sr.part_code,
            p.specification as part_specification,
            p.supplier,
            sr.scheduled_quantity,
            sr.scheduled_date,
            sr.order_date,
            sr.status,
            sr.remarks,
            
            -- 現在日付との比較
            CURDATE() as current_date_value,
            
            -- 遅延日数計算（scheduled_date < 現在日付の場合）
            CASE 
                WHEN sr.scheduled_date < CURDATE() 
                THEN DATEDIFF(CURDATE(), sr.scheduled_date)
                ELSE 0
            END as delayed_days,
            
            -- 優先度判定（緊急: ≥7日, 警告: 1-6日）
            CASE 
                WHEN sr.scheduled_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), sr.scheduled_date) >= 7
                THEN '緊急'
                WHEN sr.scheduled_date < CURDATE() 
                     AND DATEDIFF(CURDATE(), sr.scheduled_date) >= 1
                THEN '警告'
                ELSE NULL
            END as alert_priority,
            
            -- アラート種別
            '予定入荷遅延' as alert_type,
            
            -- 在庫情報も取得（影響度判定用）
            i.current_stock,
            i.reserved_stock,
            
            -- この部品を使用する生産計画があるかチェック
            (SELECT COUNT(*) FROM inventory_reservations ir 
             WHERE ir.part_code = sr.part_code) as affected_plans_count
            
        FROM scheduled_receipts sr
            INNER JOIN parts p ON sr.part_code = p.part_code
            LEFT JOIN inventory i ON sr.part_code = i.part_code
        WHERE 
            sr.status = '入荷予定'  -- 入荷予定のもののみ
            AND sr.scheduled_date < CURDATE()  -- 予定日を過ぎているもの
            AND p.is_active = TRUE
        ORDER BY 
            -- 緊急度順 → 遅延日数順 → 影響する生産計画数順
            CASE 
                WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 7 THEN 1
                ELSE 2
            END,
            DATEDIFF(CURDATE(), sr.scheduled_date) DESC,
            affected_plans_count DESC
    `;
    
    req.db.query(query, (err, results) => {
        if (err) {
            console.error('❌ 予定入荷遅延アラート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: '予定入荷遅延アラートの取得に失敗しました',
                error: err.message
            });
        }
        
        // 優先度別に分類
        const urgent_alerts = results.filter(item => item.alert_priority === '緊急');
        const warning_alerts = results.filter(item => item.alert_priority === '警告');
        
        console.log(`✅ 予定入荷遅延アラート取得完了: 緊急${urgent_alerts.length}件, 警告${warning_alerts.length}件`);
        
        res.json({
            success: true,
            data: {
                urgent_alerts,
                warning_alerts,
                summary: {
                    total_count: results.length,
                    urgent_count: urgent_alerts.length,
                    warning_count: warning_alerts.length
                }
            }
        });
    });
});

// ==========================================
// 3. 在庫不足アラート
// ==========================================
router.get('/shortage-alerts', (req, res) => {
    console.log('📉 在庫不足アラート取得開始');
    
    const query = `
        SELECT 
            isc.plan_id,
            isc.product_code,
            isc.part_code,
            p.specification as part_specification,
            p.supplier,
            p.safety_stock,
            isc.required_quantity,
            isc.current_stock,
            isc.scheduled_receipts_until_start,
            isc.available_stock,
            isc.shortage_quantity,
            isc.procurement_due_date,
            isc.start_date as production_start_date,
            isc.lead_time_days,
            
            -- 現在日付
            CURDATE() as current_date_value,
            
            -- 生産開始までの残り日数
            DATEDIFF(isc.start_date, CURDATE()) as days_until_production,
            
            -- 優先度判定（生産開始日との関係で判定）
            CASE 
                WHEN DATEDIFF(isc.start_date, CURDATE()) <= 7 
                     AND isc.shortage_quantity > 0
                THEN '緊急'
                WHEN DATEDIFF(isc.start_date, CURDATE()) <= 14 
                     AND isc.shortage_quantity > 0
                THEN '警告'
                ELSE NULL
            END as alert_priority,
            
            -- アラート種別
            '在庫不足' as alert_type,
            
            -- 不足率計算（参考情報）
            CASE 
                WHEN isc.required_quantity > 0 
                THEN ROUND((isc.shortage_quantity / isc.required_quantity) * 100, 1)
                ELSE 0
            END as shortage_percentage
            
        FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE 
            isc.shortage_quantity > 0  -- 不足している部品のみ
            AND isc.start_date >= CURDATE()  -- 未来の生産計画のみ
            AND p.is_active = TRUE
            AND DATEDIFF(isc.start_date, CURDATE()) <= 14  -- 2週間以内の生産計画
        ORDER BY 
            -- 緊急度順 → 生産開始日順 → 不足数量順
            CASE 
                WHEN DATEDIFF(isc.start_date, CURDATE()) <= 7 THEN 1
                ELSE 2
            END,
            isc.start_date ASC,
            isc.shortage_quantity DESC
    `;
    
    req.db.query(query, (err, results) => {
        if (err) {
            console.error('❌ 在庫不足アラート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: '在庫不足アラートの取得に失敗しました',
                error: err.message
            });
        }
        
        // 優先度別に分類
        const urgent_alerts = results.filter(item => item.alert_priority === '緊急');
        const warning_alerts = results.filter(item => item.alert_priority === '警告');
        
        console.log(`✅ 在庫不足アラート取得完了: 緊急${urgent_alerts.length}件, 警告${warning_alerts.length}件`);
        
        res.json({
            success: true,
            data: {
                urgent_alerts,
                warning_alerts,
                summary: {
                    total_count: results.length,
                    urgent_count: urgent_alerts.length,
                    warning_count: warning_alerts.length
                }
            }
        });
    });
});

// ==========================================
// 4. アラートサマリー（全体概要）
// ==========================================
router.get('/summary', (req, res) => {
    console.log('📊 アラートサマリー取得開始');
    
    // 複数のクエリを並行実行してサマリーを作成
    const overdueQuery = `
        SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN 1 END) as urgent_count,
            COUNT(CASE WHEN DATEDIFF(CURDATE(), isc.procurement_due_date) BETWEEN 1 AND 6 THEN 1 END) as warning_count
        FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE 
            isc.shortage_quantity > 0
            AND isc.procurement_due_date < CURDATE()
            AND p.is_active = TRUE
    `;
    
    const delayedQuery = `
        SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN DATEDIFF(CURDATE(), sr.scheduled_date) >= 7 THEN 1 END) as urgent_count,
            COUNT(CASE WHEN DATEDIFF(CURDATE(), sr.scheduled_date) BETWEEN 1 AND 6 THEN 1 END) as warning_count
        FROM scheduled_receipts sr
            INNER JOIN parts p ON sr.part_code = p.part_code
        WHERE 
            sr.status = '入荷予定'
            AND sr.scheduled_date < CURDATE()
            AND p.is_active = TRUE
    `;
    
    const shortageQuery = `
        SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN DATEDIFF(isc.start_date, CURDATE()) <= 7 THEN 1 END) as urgent_count,
            COUNT(CASE WHEN DATEDIFF(isc.start_date, CURDATE()) BETWEEN 8 AND 14 THEN 1 END) as warning_count
        FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
        WHERE 
            isc.shortage_quantity > 0
            AND isc.start_date >= CURDATE()
            AND DATEDIFF(isc.start_date, CURDATE()) <= 14
            AND p.is_active = TRUE
    `;
    
    // 3つのクエリを順次実行
    req.db.query(overdueQuery, (err1, overdueResults) => {
        if (err1) {
            console.error('❌ 発注期限超過サマリー取得エラー:', err1);
            return res.status(500).json({
                success: false,
                message: 'アラートサマリーの取得に失敗しました',
                error: err1.message
            });
        }
        
        req.db.query(delayedQuery, (err2, delayedResults) => {
            if (err2) {
                console.error('❌ 予定入荷遅延サマリー取得エラー:', err2);
                return res.status(500).json({
                    success: false,
                    message: 'アラートサマリーの取得に失敗しました',
                    error: err2.message
                });
            }
            
            req.db.query(shortageQuery, (err3, shortageResults) => {
                if (err3) {
                    console.error('❌ 在庫不足サマリー取得エラー:', err3);
                    return res.status(500).json({
                        success: false,
                        message: 'アラートサマリーの取得に失敗しました',
                        error: err3.message
                    });
                }
                
                // 結果を集計
                const overdue = overdueResults[0] || { total_count: 0, urgent_count: 0, warning_count: 0 };
                const delayed = delayedResults[0] || { total_count: 0, urgent_count: 0, warning_count: 0 };
                const shortage = shortageResults[0] || { total_count: 0, urgent_count: 0, warning_count: 0 };
                
                const summary = {
                    overdue_orders: {
                        alert_type: '発注期限超過',
                        total_count: parseInt(overdue.total_count),
                        urgent_count: parseInt(overdue.urgent_count),
                        warning_count: parseInt(overdue.warning_count)
                    },
                    delayed_receipts: {
                        alert_type: '予定入荷遅延',
                        total_count: parseInt(delayed.total_count),
                        urgent_count: parseInt(delayed.urgent_count),
                        warning_count: parseInt(delayed.warning_count)
                    },
                    shortage_alerts: {
                        alert_type: '在庫不足',
                        total_count: parseInt(shortage.total_count),
                        urgent_count: parseInt(shortage.urgent_count),
                        warning_count: parseInt(shortage.warning_count)
                    },
                    grand_total: {
                        total_count: parseInt(overdue.total_count) + parseInt(delayed.total_count) + parseInt(shortage.total_count),
                        urgent_count: parseInt(overdue.urgent_count) + parseInt(delayed.urgent_count) + parseInt(shortage.urgent_count),
                        warning_count: parseInt(overdue.warning_count) + parseInt(delayed.warning_count) + parseInt(shortage.warning_count)
                    }
                };
                
                console.log(`✅ アラートサマリー取得完了: 総件数${summary.grand_total.total_count}件`);
                console.log(`   - 発注期限超過: ${summary.overdue_orders.total_count}件`);
                console.log(`   - 予定入荷遅延: ${summary.delayed_receipts.total_count}件`);
                console.log(`   - 在庫不足: ${summary.shortage_alerts.total_count}件`);
                
                res.json({
                    success: true,
                    data: summary
                });
            });
        });
    });
});

// ==========================================
// 5. アラート種別一覧（参考情報）
// ==========================================
router.get('/alert-types', (req, res) => {
    console.log('📋 アラート種別一覧取得');
    
    const alertTypes = [
        {
            alert_type: '発注期限超過',
            description: '調達必要日を過ぎているが未発注の部品',
            priority_criteria: {
                urgent: '遅延日数 ≥ 7日',
                warning: '遅延日数 1-6日'
            },
            endpoint: '/api/procurement-alerts/overdue-orders'
        },
        {
            alert_type: '予定入荷遅延',
            description: '予定入荷日を過ぎているが未入荷の部品',
            priority_criteria: {
                urgent: '遅延日数 ≥ 7日',
                warning: '遅延日数 1-6日'
            },
            endpoint: '/api/procurement-alerts/delayed-receipts'
        },
        {
            alert_type: '在庫不足',
            description: '生産計画に対して在庫が不足している部品',
            priority_criteria: {
                urgent: '生産開始まで ≤ 7日',
                warning: '生産開始まで 8-14日'
            },
            endpoint: '/api/procurement-alerts/shortage-alerts'
        }
    ];
    
    res.json({
        success: true,
        data: alertTypes
    });
});

module.exports = router;