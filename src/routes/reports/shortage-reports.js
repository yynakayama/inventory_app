// ==========================================
// 不足部品レポート専用API（修正版 - 計画重複除去）
// ファイル: src/routes/reports/shortage-reports.js
// 目的: 生産計画に基づく部品不足の分析・調達支援機能
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireReadAccess } = require('../../middleware/auth');

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
// 1. 不足部品リスト（基本版）- 修正版
// GET /api/reports/shortage-parts/
// 権限: 全ユーザー（認証必須）
// 目的: 生産計画に基づく不足部品の一覧（調達優先度付き・重複除去）
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📊 不足部品リスト取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            SELECT 
                isc.part_code,
                p.specification as part_specification,
                p.category as part_category,
                p.supplier,
                p.unit_price,
                p.lead_time_days,
                
                -- 部品ごとに集約した数量情報
                SUM(isc.shortage_quantity) as shortage_quantity,
                MAX(isc.current_stock) as current_stock,
                MAX(isc.total_reserved_stock) as total_reserved_stock,
                MAX(isc.scheduled_receipts_until_start) as scheduled_receipts_until_start,
                MIN(isc.available_stock) as available_stock,
                
                -- 最も早い調達期限を採用
                MIN(isc.procurement_due_date) as procurement_due_date,
                MIN(isc.start_date) as production_start_date,
                
                -- 関連する生産計画情報を集約
                GROUP_CONCAT(DISTINCT isc.product_code ORDER BY isc.product_code) as product_codes,
                SUM(isc.planned_quantity) as total_production_quantity,
                
                -- 優先度判定（最も早い調達期限ベース）
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 7 THEN '緊急'
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 1 THEN '警告'
                    WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 3 THEN '注意'
                    ELSE '通常'
                END as procurement_priority,
                
                -- 遅延日数計算（最も早い期限ベース）
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                    THEN DATEDIFF(CURDATE(), MIN(isc.procurement_due_date))
                    ELSE 0
                END as overdue_days,
                
                -- 概算調達金額（全計画の合計）
                ROUND(SUM(isc.shortage_quantity) * COALESCE(p.unit_price, 0), 2) as estimated_cost,
                
                -- 在庫状況詳細
                CONCAT(
                    '現在:', MAX(isc.current_stock), '個 | ',
                    '予約:', MAX(isc.total_reserved_stock), '個 | ',
                    '予定入荷:', MAX(isc.scheduled_receipts_until_start), '個'
                ) as stock_detail
                
            FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
            WHERE isc.shortage_quantity > 0  -- 不足がある部品のみ
            GROUP BY 
                isc.part_code, 
                p.specification, 
                p.category, 
                p.supplier, 
                p.unit_price, 
                p.lead_time_days
            ORDER BY 
                -- 優先度順序（緊急→警告→注意→通常）
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 7 THEN 1
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 1 THEN 2
                    WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 3 THEN 3
                    ELSE 4
                END,
                MIN(isc.procurement_due_date) ASC,  -- 調達期限の早い順
                SUM(isc.shortage_quantity) DESC     -- 不足数量の多い順
        `;

        const [results] = await connection.execute(query);

        // サマリー情報の計算（重複除去後）
        const summary = {
            total_shortage_parts: results.length,  // 正確な部品種類数
            total_estimated_cost: results.reduce((sum, item) => sum + parseFloat(item.estimated_cost || 0), 0),
            priority_breakdown: {
                emergency: results.filter(r => r.procurement_priority === '緊急').length,
                warning: results.filter(r => r.procurement_priority === '警告').length,
                caution: results.filter(r => r.procurement_priority === '注意').length,
                normal: results.filter(r => r.procurement_priority === '通常').length
            },
            max_overdue_days: Math.max(...results.map(r => r.overdue_days), 0),
            suppliers_affected: [...new Set(results.map(r => r.supplier))].length
        };

        console.log(`✅ 不足部品リスト取得完了: ${results.length}件（緊急: ${summary.priority_breakdown.emergency}件）`);

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '不足部品リスト（基本版・重複除去済み）',
                    generated_at: new Date().toISOString(),
                    generated_by: req.user.username,
                    description: '生産計画に基づく不足部品の一覧。調達優先度付き。部品重複除去済み。'
                },
                summary: summary,
                shortage_parts: results
            },
            message: `不足部品リストを${results.length}件取得しました（重複除去済み）`
        });

    } catch (error) {
        console.error('❌ 不足部品リスト取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '不足部品リストの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 発注が必要な不足部品リスト（予定入荷考慮版）
// GET /api/reports/shortage-parts/procurement-needed
// 権限: 全ユーザー（認証必須）
// 目的: 予定入荷を考慮して、実際に追加発注が必要な不足部品のみ取得
// ==========================================
router.get('/procurement-needed', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📊 発注必要不足部品リスト取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            WITH shortage_with_receipts AS (
                SELECT 
                    isc.part_code,
                    p.specification as part_specification,
                    p.category as part_category,
                    p.supplier,
                    p.unit_price,
                    p.lead_time_days,
                    
                    -- 部品ごとに集約した数量情報
                    SUM(isc.shortage_quantity) as shortage_quantity,
                    MAX(isc.current_stock) as current_stock,
                    MAX(isc.total_reserved_stock) as total_reserved_stock,
                    MIN(isc.available_stock) as available_stock,
                    
                    -- 最も早い調達期限を採用
                    MIN(isc.procurement_due_date) as procurement_due_date,
                    MIN(isc.start_date) as production_start_date,
                    
                    -- 関連する生産計画情報を集約
                    GROUP_CONCAT(DISTINCT isc.product_code ORDER BY isc.product_code) as product_codes,
                    SUM(isc.planned_quantity) as total_production_quantity,
                    
                    -- 概算調達金額（全計画の合計）
                    ROUND(SUM(isc.shortage_quantity) * COALESCE(p.unit_price, 0), 2) as estimated_cost,
                    
                    -- 該当部品の全予定入荷数量を計算（納期回答待ち + 入荷予定）
                    COALESCE(SUM(CASE 
                        WHEN sr.status IN ('納期回答待ち', '入荷予定') 
                        THEN COALESCE(sr.scheduled_quantity, sr.order_quantity) 
                        ELSE 0 
                    END), 0) as total_scheduled_receipts
                    
                FROM inventory_sufficiency_check isc
                INNER JOIN parts p ON isc.part_code = p.part_code
                LEFT JOIN scheduled_receipts sr ON isc.part_code = sr.part_code 
                    AND sr.status IN ('納期回答待ち', '入荷予定')
                WHERE isc.shortage_quantity > 0  -- 不足がある部品のみ
                GROUP BY 
                    isc.part_code, 
                    p.specification, 
                    p.category, 
                    p.supplier, 
                    p.unit_price, 
                    p.lead_time_days
            )
            SELECT *,
                   -- 実際の追加発注必要数量
                   GREATEST(0, shortage_quantity - total_scheduled_receipts) as additional_order_needed
            FROM shortage_with_receipts
            WHERE shortage_quantity > total_scheduled_receipts  -- 予定入荷を超える不足がある場合のみ
            ORDER BY 
                procurement_due_date ASC,  -- 調達期限の早い順
                shortage_quantity DESC     -- 不足数量の多い順
        `;

        const [results] = await connection.execute(query);

        // サマリー情報の計算
        const summary = {
            total_parts_needing_procurement: results.length,
            total_additional_cost: results.reduce((sum, item) => sum + parseFloat(item.estimated_cost || 0), 0),
            total_additional_quantity: results.reduce((sum, item) => sum + item.additional_order_needed, 0),
            suppliers_affected: [...new Set(results.map(r => r.supplier))].length
        };

        console.log(`✅ 発注必要不足部品リスト取得完了: ${results.length}件`);

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '発注必要不足部品リスト（予定入荷考慮版）',
                    generated_at: new Date().toISOString(),
                    generated_by: req.user.username,
                    description: '予定入荷を考慮して、実際に追加発注が必要な不足部品のみ抽出。'
                },
                summary: summary,
                shortage_parts: results
            },
            message: `発注が必要な不足部品を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 発注必要不足部品リスト取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '発注必要不足部品リストの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 仕入先別不足部品サマリー（重要機能）- 修正版
// GET /api/reports/shortage-parts/by-supplier
// 権限: 全ユーザー（認証必須）
// 目的: 仕入先ごとの不足部品集計（発注業務の効率化用・重複除去）
// ==========================================
router.get('/by-supplier', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📊 仕入先別不足部品サマリー取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            WITH part_shortage_summary AS (
                -- Step1: 部品ごとに計画を集約
                SELECT 
                    isc.part_code,
                    p.supplier,
                    p.specification,
                    p.unit_price,
                    SUM(isc.shortage_quantity) as total_shortage_quantity,
                    MIN(isc.procurement_due_date) as earliest_due_date,
                    
                    -- 優先度判定（最も早い期限ベース）
                    CASE 
                        WHEN MIN(isc.procurement_due_date) < CURDATE() 
                             AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 7 THEN '緊急'
                        WHEN MIN(isc.procurement_due_date) < CURDATE() 
                             AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 1 THEN '警告'
                        WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 3 THEN '注意'
                        ELSE '通常'
                    END as priority,
                    
                    -- 遅延日数
                    CASE 
                        WHEN MIN(isc.procurement_due_date) < CURDATE() 
                        THEN DATEDIFF(CURDATE(), MIN(isc.procurement_due_date))
                        ELSE 0
                    END as overdue_days
                    
                FROM inventory_sufficiency_check isc
                INNER JOIN parts p ON isc.part_code = p.part_code
                WHERE isc.shortage_quantity > 0
                GROUP BY isc.part_code, p.supplier, p.specification, p.unit_price
            )
            -- Step2: 仕入先ごとに集計
            SELECT 
                supplier,
                COUNT(*) as shortage_parts_count,  -- 正確な部品種類数
                SUM(total_shortage_quantity) as total_shortage_quantity,
                ROUND(SUM(total_shortage_quantity * COALESCE(unit_price, 0)), 2) as total_estimated_cost,
                
                -- 優先度別集計
                COUNT(CASE WHEN priority = '緊急' THEN 1 END) as emergency_parts_count,
                COUNT(CASE WHEN priority = '警告' THEN 1 END) as warning_parts_count,
                COUNT(CASE WHEN priority = '注意' THEN 1 END) as caution_parts_count,
                COUNT(CASE WHEN priority = '通常' THEN 1 END) as normal_parts_count,
                
                -- 最早調達期限
                MIN(earliest_due_date) as earliest_due_date,
                
                -- 最大遅延日数
                MAX(overdue_days) as max_overdue_days,
                
                -- 部品詳細をJSON配列で集約
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'part_code', part_code,
                        'specification', specification,
                        'shortage_quantity', total_shortage_quantity,
                        'procurement_due_date', earliest_due_date,
                        'estimated_cost', ROUND(total_shortage_quantity * COALESCE(unit_price, 0), 2),
                        'priority', priority,
                        'overdue_days', overdue_days
                    )
                ) as parts_detail
                
            FROM part_shortage_summary
            GROUP BY supplier
            ORDER BY 
                emergency_parts_count DESC,    -- 緊急部品が多い仕入先を優先
                total_estimated_cost DESC,     -- 金額インパクトの大きい順
                earliest_due_date ASC         -- 調達期限の早い順
        `;

        const [results] = await connection.execute(query);

        // 全体サマリーの計算
        const summary = {
            total_suppliers: results.length,
            total_shortage_parts: results.reduce((sum, item) => sum + item.shortage_parts_count, 0),
            total_estimated_cost: results.reduce((sum, item) => sum + parseFloat(item.total_estimated_cost || 0), 0),
            priority_suppliers: {
                with_emergency: results.filter(r => r.emergency_parts_count > 0).length,
                with_warning: results.filter(r => r.warning_parts_count > 0).length,
                with_caution: results.filter(r => r.caution_parts_count > 0).length,
                with_normal: results.filter(r => r.normal_parts_count > 0).length
            },
            most_critical_supplier: results.length > 0 ? {
                supplier: results[0].supplier,
                emergency_parts: results[0].emergency_parts_count,
                total_cost: results[0].total_estimated_cost
            } : null
        };

        console.log(`✅ 仕入先別不足部品サマリー取得完了: ${results.length}社（緊急対応必要: ${summary.priority_suppliers.with_emergency}社）`);

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '仕入先別不足部品サマリー（重複除去済み）',
                    generated_at: new Date().toISOString(),
                    generated_by: req.user.username,
                    description: '仕入先ごとの不足部品集計。発注業務の効率化用。部品重複除去済み。'
                },
                summary: summary,
                suppliers: results
            },
            message: `仕入先別不足部品サマリーを${results.length}社分取得しました（重複除去済み）`
        });

    } catch (error) {
        console.error('❌ 仕入先別不足部品サマリー取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '仕入先別不足部品サマリーの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. 不足部品リスト（簡易版）- 修正版
// GET /api/reports/shortage-parts/simple
// 権限: 全ユーザー（認証必須）
// 目的: 不足部品の概要一覧（素早い確認用・重複除去）
// ==========================================
router.get('/simple', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📊 簡易不足部品リスト取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            SELECT 
                isc.part_code,
                p.specification,
                p.supplier,
                p.category,
                
                -- 部品ごとに集約
                SUM(isc.shortage_quantity) as shortage_quantity,
                MIN(isc.procurement_due_date) as procurement_due_date,
                
                -- 優先度判定（簡易版・最も早い期限ベース）
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() THEN '期限超過'
                    WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 3 THEN '3日以内'
                    WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 7 THEN '1週間以内'
                    ELSE '余裕あり'
                END as urgency_level,
                
                -- 概算金額
                ROUND(SUM(isc.shortage_quantity) * COALESCE(p.unit_price, 0), 2) as estimated_cost
                
            FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
            WHERE isc.shortage_quantity > 0
            GROUP BY 
                isc.part_code,
                p.specification,
                p.supplier,
                p.category,
                p.unit_price
            ORDER BY 
                MIN(isc.procurement_due_date) ASC,
                SUM(isc.shortage_quantity) DESC
        `;

        const [results] = await connection.execute(query);

        const summary = {
            total_parts: results.length,  // 正確な部品種類数
            total_estimated_cost: results.reduce((sum, item) => sum + parseFloat(item.estimated_cost || 0), 0),
            urgency_breakdown: {
                overdue: results.filter(r => r.urgency_level === '期限超過').length,
                within_3_days: results.filter(r => r.urgency_level === '3日以内').length,
                within_1_week: results.filter(r => r.urgency_level === '1週間以内').length,
                sufficient: results.filter(r => r.urgency_level === '余裕あり').length
            }
        };

        console.log(`✅ 簡易不足部品リスト取得完了: ${results.length}件（期限超過: ${summary.urgency_breakdown.overdue}件）`);

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '不足部品リスト（簡易版・重複除去済み）',
                    generated_at: new Date().toISOString(),
                    generated_by: req.user.username,
                    description: '不足部品の概要一覧。素早い確認用。部品重複除去済み。'
                },
                summary: summary,
                shortage_parts: results
            },
            message: `簡易不足部品リストを${results.length}件取得しました（重複除去済み）`
        });

    } catch (error) {
        console.error('❌ 簡易不足部品リスト取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '簡易不足部品リストの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 4. 部品別不足詳細（パラメータ付き - 最後に定義）- 修正版
// GET /api/reports/shortage-parts/:part_code
// 権限: 全ユーザー（認証必須）
// 目的: 指定部品の詳細な不足情報（全計画の詳細表示）
// ==========================================
router.get('/:part_code', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const partCode = req.params.part_code;
        
        console.log(`[${new Date().toISOString()}] 🔍 部品別不足詳細取得開始: ユーザー=${req.user.username}, 部品=${partCode}`);
        
        connection = await mysql.createConnection(dbConfig);

        // 部品の基本情報と集約データ
        const summaryQuery = `
            SELECT 
                isc.part_code,
                p.specification,
                p.category,
                p.supplier,
                p.unit_price,
                p.lead_time_days,
                p.safety_stock,
                
                -- 集約された数量情報
                SUM(isc.shortage_quantity) as total_shortage_quantity,
                MAX(isc.current_stock) as current_stock,
                MAX(isc.total_reserved_stock) as total_reserved_stock,
                MAX(isc.scheduled_receipts_until_start) as scheduled_receipts_until_start,
                MIN(isc.available_stock) as available_stock,
                
                -- 最も早い調達期限
                MIN(isc.procurement_due_date) as earliest_procurement_due_date,
                
                -- 優先度判定
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 7 THEN '緊急'
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                         AND DATEDIFF(CURDATE(), MIN(isc.procurement_due_date)) >= 1 THEN '警告'
                    WHEN DATEDIFF(MIN(isc.procurement_due_date), CURDATE()) <= 3 THEN '注意'
                    ELSE '通常'
                END as procurement_priority,
                
                -- 遅延日数
                CASE 
                    WHEN MIN(isc.procurement_due_date) < CURDATE() 
                    THEN DATEDIFF(CURDATE(), MIN(isc.procurement_due_date))
                    ELSE 0
                END as overdue_days,
                
                -- 概算金額
                ROUND(SUM(isc.shortage_quantity) * COALESCE(p.unit_price, 0), 2) as total_estimated_cost,
                
                -- 安全在庫との比較
                CASE
                    WHEN MIN(isc.available_stock) < p.safety_stock THEN '安全在庫割れ'
                    ELSE '安全在庫内'
                END as safety_stock_status
                
            FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
            WHERE isc.part_code = ? AND isc.shortage_quantity > 0
            GROUP BY 
                isc.part_code, p.specification, p.category, p.supplier, 
                p.unit_price, p.lead_time_days, p.safety_stock
        `;

        // 計画別の詳細情報
        const planDetailsQuery = `
            SELECT 
                isc.*,
                -- 計画別の優先度
                CASE 
                    WHEN isc.procurement_due_date < CURDATE() 
                         AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN '緊急'
                    WHEN isc.procurement_due_date < CURDATE() 
                         AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN '警告'
                    WHEN DATEDIFF(isc.procurement_due_date, CURDATE()) <= 3 THEN '注意'
                    ELSE '通常'
                END as plan_priority,
                
                -- 計画別の遅延日数
                CASE 
                    WHEN isc.procurement_due_date < CURDATE() 
                    THEN DATEDIFF(CURDATE(), isc.procurement_due_date)
                    ELSE 0
                END as plan_overdue_days,
                
                -- 計画別の概算金額
                ROUND(isc.shortage_quantity * COALESCE(
                    (SELECT unit_price FROM parts WHERE part_code = isc.part_code), 0
                ), 2) as plan_estimated_cost
                
            FROM inventory_sufficiency_check isc
            WHERE isc.part_code = ? AND isc.shortage_quantity > 0
            ORDER BY isc.procurement_due_date ASC, isc.shortage_quantity DESC
        `;

        const [summaryResults] = await connection.execute(summaryQuery, [partCode]);
        const [planResults] = await connection.execute(planDetailsQuery, [partCode]);

        if (summaryResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された部品の不足情報が見つからないか、不足がありません',
                error: 'PART_NOT_FOUND_OR_NO_SHORTAGE',
                part_code: partCode
            });
        }

        // 予定入荷情報も追加取得
        const receiptQuery = `
            SELECT 
                id,
                order_no,
                scheduled_quantity,
                scheduled_date,
                supplier,
                status,
                order_date,
                remarks
            FROM scheduled_receipts 
            WHERE part_code = ? AND status IN ('納期回答待ち', '入荷予定')
            ORDER BY COALESCE(scheduled_date, '9999-12-31') ASC
        `;

        const [receiptResults] = await connection.execute(receiptQuery, [partCode]);

        console.log(`✅ 部品別不足詳細取得完了: ${partCode} (総不足数量: ${summaryResults[0].total_shortage_quantity}, 計画数: ${planResults.length})`);

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '部品別不足詳細（重複除去済み）',
                    generated_at: new Date().toISOString(),
                    generated_by: req.user.username,
                    description: `部品 ${partCode} の詳細不足情報。全計画の詳細含む。`
                },
                part_summary: summaryResults[0],  // 集約された概要情報
                plan_details: planResults,        // 計画別の詳細情報
                scheduled_receipts: receiptResults
            },
            message: `部品 ${partCode} の不足詳細情報を取得しました（総数量: ${summaryResults[0].total_shortage_quantity}、計画数: ${planResults.length}）`
        });

    } catch (error) {
        console.error('❌ 部品別不足詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品別不足詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;