const express = require('express');
const router = express.Router();

/**
 * 棚おろしレポート専用API
 * 棚おろし差異分析・履歴管理機能
 * 
 * ベースパス: /api/reports/stocktaking
 * 
 * エンドポイント:
 * GET /                    → 棚おろし差異レポート（全体概要）
 * GET /differences         → 棚おろし差異詳細リスト
 * GET /summary             → 棚おろしサマリー（日付別）
 * GET /part-history        → 部品別棚おろし履歴
 * GET /by-category         → カテゴリ別差異分析
 */

// ==========================================
// 1. 棚おろし差異レポート（全体概要）
// GET /api/reports/stocktaking/
// ==========================================
router.get('/', (req, res) => {
    const query = `
        SELECT 
            s.id,
            s.stocktaking_date,
            s.part_code,
            p.specification as part_specification,
            p.category as part_category,
            p.supplier,
            p.unit_price,
            s.book_quantity,
            s.actual_quantity,
            s.difference,
            s.reason_code,
            s.remarks,
            s.created_by,
            s.created_at,
            
            -- 差異の分類
            CASE 
                WHEN s.difference > 0 THEN '増加'
                WHEN s.difference < 0 THEN '減少'
                ELSE '差異なし'
            END as difference_type,
            
            -- 差異率の計算
            CASE 
                WHEN s.book_quantity > 0 
                THEN ROUND((s.difference / s.book_quantity) * 100, 2)
                ELSE NULL
            END as difference_percentage,
            
            -- 金額インパクト（概算）
            ROUND(ABS(s.difference) * COALESCE(p.unit_price, 0), 2) as amount_impact,
            
            -- 差異の重要度判定
            CASE 
                WHEN ABS(s.difference) >= 100 OR 
                     (s.book_quantity > 0 AND ABS(s.difference / s.book_quantity) >= 0.2)
                THEN '重大差異'
                WHEN ABS(s.difference) >= 50 OR 
                     (s.book_quantity > 0 AND ABS(s.difference / s.book_quantity) >= 0.1)
                THEN '中程度差異'
                WHEN ABS(s.difference) >= 10 OR 
                     (s.book_quantity > 0 AND ABS(s.difference / s.book_quantity) >= 0.05)
                THEN '軽微差異'
                ELSE '微細差異'
            END as severity_level,
            
            -- 経過日数
            DATEDIFF(CURDATE(), s.stocktaking_date) as days_since_stocktaking
            
        FROM stocktaking s
        INNER JOIN parts p ON s.part_code = p.part_code
        ORDER BY 
            s.stocktaking_date DESC,
            ABS(s.difference) DESC,
            amount_impact DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('棚おろし差異レポート取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // サマリー情報の計算
        const summary = {
            total_stocktaking_records: results.length,
            total_amount_impact: results.reduce((sum, item) => sum + parseFloat(item.amount_impact || 0), 0),
            difference_breakdown: {
                increases: results.filter(r => r.difference_type === '増加').length,
                decreases: results.filter(r => r.difference_type === '減少').length,
                no_difference: results.filter(r => r.difference_type === '差異なし').length
            },
            severity_breakdown: {
                critical: results.filter(r => r.severity_level === '重大差異').length,
                moderate: results.filter(r => r.severity_level === '中程度差異').length,
                minor: results.filter(r => r.severity_level === '軽微差異').length,
                minimal: results.filter(r => r.severity_level === '微細差異').length
            },
            reason_breakdown: {
                theft: results.filter(r => r.reason_code === '盗難').length,
                damage: results.filter(r => r.reason_code === '破損').length,
                miscount: results.filter(r => r.reason_code === '計数ミス').length,
                other: results.filter(r => r.reason_code === 'その他').length
            },
            latest_stocktaking_date: results.length > 0 ? results[0].stocktaking_date : null
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '棚おろし差異レポート（全体概要）',
                    generated_at: new Date().toISOString(),
                    description: '棚おろし実施結果の差異分析。在庫精度向上用。'
                },
                summary: summary,
                stocktaking_records: results
            }
        });
    });
});

// ==========================================
// 2. 棚おろし差異詳細リスト（差異ありのみ）
// GET /api/reports/stocktaking/differences
// ==========================================
router.get('/differences', (req, res) => {
    const query = `
        SELECT 
            s.stocktaking_date,
            s.part_code,
            p.specification as part_specification,
            p.category as part_category,
            p.supplier,
            s.book_quantity,
            s.actual_quantity,
            s.difference,
            s.reason_code,
            
            -- 差異率
            CASE 
                WHEN s.book_quantity > 0 
                THEN ROUND((s.difference / s.book_quantity) * 100, 2)
                ELSE NULL
            END as difference_percentage,
            
            -- 金額インパクト
            ROUND(ABS(s.difference) * COALESCE(p.unit_price, 0), 2) as amount_impact,
            
            -- 差異傾向
            CASE 
                WHEN s.difference > 0 THEN '帳簿在庫不足'
                WHEN s.difference < 0 THEN '帳簿在庫過多'
                ELSE '差異なし'
            END as difference_trend,
            
            s.remarks
            
        FROM stocktaking s
        INNER JOIN parts p ON s.part_code = p.part_code
        WHERE s.difference != 0  -- 差異がある記録のみ
        ORDER BY 
            ABS(s.difference) DESC,  -- 差異の絶対値が大きい順
            s.stocktaking_date DESC,
            amount_impact DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('棚おろし差異詳細リスト取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 差異のあるレコードのサマリー
        const summary = {
            total_differences: results.length,
            total_amount_impact: results.reduce((sum, item) => sum + parseFloat(item.amount_impact || 0), 0),
            average_difference_percentage: results.length > 0 
                ? Math.round(results.reduce((sum, item) => sum + Math.abs(parseFloat(item.difference_percentage || 0)), 0) / results.length * 100) / 100
                : 0,
            trend_analysis: {
                book_shortage: results.filter(r => r.difference_trend === '帳簿在庫不足').length,
                book_excess: results.filter(r => r.difference_trend === '帳簿在庫過多').length
            },
            max_difference: results.length > 0 ? Math.max(...results.map(r => Math.abs(r.difference))) : 0
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '棚おろし差異詳細リスト',
                    generated_at: new Date().toISOString(),
                    description: '差異が発生した部品の詳細分析。差異原因調査用。'
                },
                summary: summary,
                differences: results
            }
        });
    });
});

// ==========================================
// 3. 棚おろしサマリー（日付別）
// GET /api/reports/stocktaking/summary
// ==========================================
router.get('/summary', (req, res) => {
    const query = `
        SELECT 
            DATE(s.stocktaking_date) as stocktaking_date,
            COUNT(*) as total_parts_count,
            COUNT(CASE WHEN s.difference != 0 THEN 1 END) as difference_parts_count,
            COUNT(CASE WHEN s.difference > 0 THEN 1 END) as increase_parts_count,
            COUNT(CASE WHEN s.difference < 0 THEN 1 END) as decrease_parts_count,
            SUM(ABS(s.difference)) as total_difference_quantity,
            
            -- 差異率
            ROUND(
                COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*), 
                2
            ) as difference_ratio_percentage,
            
            -- 理由別集計
            COUNT(CASE WHEN s.reason_code = '盗難' THEN 1 END) as theft_count,
            COUNT(CASE WHEN s.reason_code = '破損' THEN 1 END) as damage_count,
            COUNT(CASE WHEN s.reason_code = '計数ミス' THEN 1 END) as miscount_count,
            COUNT(CASE WHEN s.reason_code = 'その他' THEN 1 END) as other_count,
            
            -- 金額インパクト集計
            ROUND(SUM(ABS(s.difference) * COALESCE(p.unit_price, 0)), 2) as total_amount_impact,
            
            -- 平均差異
            ROUND(AVG(ABS(s.difference)), 2) as avg_difference_quantity
            
        FROM stocktaking s
        INNER JOIN parts p ON s.part_code = p.part_code
        GROUP BY DATE(s.stocktaking_date)
        ORDER BY stocktaking_date DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('棚おろしサマリー取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 全体統計の計算
        const summary = {
            total_stocktaking_dates: results.length,
            overall_statistics: {
                total_parts_checked: results.reduce((sum, item) => sum + item.total_parts_count, 0),
                total_differences_found: results.reduce((sum, item) => sum + item.difference_parts_count, 0),
                total_amount_impact: results.reduce((sum, item) => sum + parseFloat(item.total_amount_impact || 0), 0),
                average_difference_ratio: results.length > 0 
                    ? Math.round(results.reduce((sum, item) => sum + item.difference_ratio_percentage, 0) / results.length * 100) / 100
                    : 0
            },
            trend_analysis: {
                improving: results.slice(0, 3).every((item, index, arr) => 
                    index === 0 || item.difference_ratio_percentage <= arr[index - 1].difference_ratio_percentage
                ),
                latest_difference_ratio: results.length > 0 ? results[0].difference_ratio_percentage : 0
            }
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '棚おろしサマリー（日付別）',
                    generated_at: new Date().toISOString(),
                    description: '日付別の棚おろし結果サマリー。精度推移の分析用。'
                },
                summary: summary,
                stocktaking_summary: results
            }
        });
    });
});

// ==========================================
// 4. 部品別棚おろし履歴
// GET /api/reports/stocktaking/part-history
// ==========================================
router.get('/part-history', (req, res) => {
    const query = `
        SELECT 
            s.part_code,
            p.specification as part_specification,
            p.category as part_category,
            p.supplier,
            COUNT(*) as stocktaking_count,
            COUNT(CASE WHEN s.difference != 0 THEN 1 END) as difference_count,
            
            -- 差異統計
            ROUND(AVG(ABS(s.difference)), 2) as avg_difference,
            MAX(ABS(s.difference)) as max_difference,
            MIN(s.stocktaking_date) as first_stocktaking_date,
            MAX(s.stocktaking_date) as last_stocktaking_date,
            
            -- 差異率統計
            ROUND(
                COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*), 
                2
            ) as difference_frequency_percentage,
            
            -- 最新在庫状況
            (SELECT current_stock FROM inventory i WHERE i.part_code = s.part_code) as current_stock,
            
            -- 金額インパクト
            ROUND(SUM(ABS(s.difference) * COALESCE(p.unit_price, 0)), 2) as total_amount_impact,
            
            -- 差異傾向の分析
            CASE 
                WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 50 THEN '高頻度差異'
                WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 20 THEN '中頻度差異'
                ELSE '低頻度差異'
            END as difference_tendency,
            
            -- 主要差異理由
            (SELECT reason_code 
             FROM stocktaking s2 
             WHERE s2.part_code = s.part_code AND s2.difference != 0
             GROUP BY reason_code 
             ORDER BY COUNT(*) DESC 
             LIMIT 1) as primary_difference_reason
             
        FROM stocktaking s
        INNER JOIN parts p ON s.part_code = p.part_code
        GROUP BY s.part_code, p.specification, p.category, p.supplier
        ORDER BY 
            difference_count DESC,
            total_amount_impact DESC,
            difference_frequency_percentage DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('部品別棚おろし履歴取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 部品別分析サマリー
        const summary = {
            total_parts_analyzed: results.length,
            high_risk_parts: results.filter(r => r.difference_tendency === '高頻度差異').length,
            medium_risk_parts: results.filter(r => r.difference_tendency === '中頻度差異').length,
            low_risk_parts: results.filter(r => r.difference_tendency === '低頻度差異').length,
            total_amount_impact: results.reduce((sum, item) => sum + parseFloat(item.total_amount_impact || 0), 0),
            most_problematic_part: results.length > 0 ? {
                part_code: results[0].part_code,
                specification: results[0].part_specification,
                difference_count: results[0].difference_count
            } : null
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: '部品別棚おろし履歴',
                    generated_at: new Date().toISOString(),
                    description: '部品ごとの棚おろし履歴と差異傾向分析。問題部品の特定用。'
                },
                summary: summary,
                part_history: results
            }
        });
    });
});

// ==========================================
// 5. カテゴリ別差異分析
// GET /api/reports/stocktaking/by-category
// ==========================================
router.get('/by-category', (req, res) => {
    const query = `
        SELECT 
            p.category,
            COUNT(*) as total_stocktaking_count,
            COUNT(CASE WHEN s.difference != 0 THEN 1 END) as difference_count,
            COUNT(DISTINCT s.part_code) as parts_count,
            
            -- 差異統計
            SUM(ABS(s.difference)) as total_difference_quantity,
            ROUND(AVG(ABS(s.difference)), 2) as avg_difference_quantity,
            MAX(ABS(s.difference)) as max_difference_quantity,
            
            -- 差異率
            ROUND(
                COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*), 
                2
            ) as difference_ratio_percentage,
            
            -- 金額インパクト
            ROUND(SUM(ABS(s.difference) * COALESCE(p.unit_price, 0)), 2) as total_amount_impact,
            
            -- 理由別集計
            COUNT(CASE WHEN s.reason_code = '盗難' THEN 1 END) as theft_count,
            COUNT(CASE WHEN s.reason_code = '破損' THEN 1 END) as damage_count,
            COUNT(CASE WHEN s.reason_code = '計数ミス' THEN 1 END) as miscount_count,
            COUNT(CASE WHEN s.reason_code = 'その他' THEN 1 END) as other_count,
            
            -- カテゴリ別リスク判定
            CASE 
                WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 30 THEN '高リスク'
                WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 15 THEN '中リスク'
                ELSE '低リスク'
            END as risk_level
            
        FROM stocktaking s
        INNER JOIN parts p ON s.part_code = p.part_code
        WHERE p.category IS NOT NULL
        GROUP BY p.category
        ORDER BY 
            difference_ratio_percentage DESC,
            total_amount_impact DESC,
            difference_count DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('カテゴリ別差異分析取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // カテゴリ分析サマリー
        const summary = {
            total_categories: results.length,
            total_amount_impact: results.reduce((sum, item) => sum + parseFloat(item.total_amount_impact || 0), 0),
            risk_breakdown: {
                high_risk: results.filter(r => r.risk_level === '高リスク').length,
                medium_risk: results.filter(r => r.risk_level === '中リスク').length,
                low_risk: results.filter(r => r.risk_level === '低リスク').length
            },
            most_problematic_category: results.length > 0 ? {
                category: results[0].category,
                difference_ratio: results[0].difference_ratio_percentage,
                amount_impact: results[0].total_amount_impact
            } : null,
            overall_difference_ratio: results.length > 0 
                ? Math.round(results.reduce((sum, item) => sum + item.difference_ratio_percentage, 0) / results.length * 100) / 100
                : 0
        };

        res.json({
            success: true,
            data: {
                report_info: {
                    report_type: 'カテゴリ別差異分析',
                    generated_at: new Date().toISOString(),
                    description: '部品カテゴリごとの差異傾向分析。管理方針決定用。'
                },
                summary: summary,
                category_analysis: results
            }
        });
    });
});

module.exports = router;