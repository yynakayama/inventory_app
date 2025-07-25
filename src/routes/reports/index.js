const express = require('express');
const router = express.Router();

/**
 * 帳票出力メインルーター
 * 各種レポート機能への振り分け
 * 
 * ディレクトリ構造:
 * routes/reports/
 * ├── index.js              (このファイル - メインルーター)
 * ├── shortage-reports.js   (不足部品レポート)
 * ├── scheduled-receipts-reports.js (予定入荷レポート)
 * └── stocktaking-reports.js (棚おろしレポート)
 */

// ==========================================
// サブルーターの読み込みと設定
// ==========================================

// 不足部品レポート (/api/reports/shortage-parts/*)
router.use('/shortage-parts', require('./shortage-reports'));

// 予定入荷レポート (/api/reports/scheduled-receipts/*)
router.use('/scheduled-receipts', require('./scheduled-receipts-reports'));

// 棚おろしレポート (/api/reports/stocktaking/*)
router.use('/stocktaking', require('./stocktaking-reports'));

// ==========================================
// メイン帳票API (ダッシュボード用サマリー)
// ==========================================

/**
 * 帳票ダッシュボード - 全レポートのサマリー情報
 * GET /api/reports/dashboard
 */
router.get('/dashboard', (req, res) => {
    // 複数のクエリを並列実行してサマリー情報を取得
    const queries = {
        // 不足部品の概要
        shortage_summary: `
            SELECT 
                COUNT(*) as total_shortage_parts,
                COUNT(CASE 
                    WHEN isc.procurement_due_date < CURDATE() 
                         AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 7 THEN 1 
                END) as emergency_parts,
                COUNT(CASE 
                    WHEN isc.procurement_due_date < CURDATE() 
                         AND DATEDIFF(CURDATE(), isc.procurement_due_date) >= 1 THEN 1 
                END) as warning_parts,
                ROUND(SUM(isc.shortage_quantity * COALESCE(p.unit_price, 0)), 2) as total_shortage_cost
            FROM inventory_sufficiency_check isc
            INNER JOIN parts p ON isc.part_code = p.part_code
            WHERE isc.shortage_quantity > 0
        `,
        
        // 予定入荷の概要
        receipts_summary: `
            SELECT 
                COUNT(*) as total_scheduled_receipts,
                COUNT(CASE WHEN status = '納期回答待ち' THEN 1 END) as pending_response,
                COUNT(CASE 
                    WHEN status = '入荷予定' AND scheduled_date < CURDATE() THEN 1 
                END) as delayed_receipts,
                COUNT(CASE 
                    WHEN status = '入荷予定' 
                         AND DATEDIFF(scheduled_date, CURDATE()) <= 3 
                         AND scheduled_date >= CURDATE() THEN 1 
                END) as urgent_receipts
            FROM scheduled_receipts
            WHERE status IN ('納期回答待ち', '入荷予定')
        `,
        
        // 仕入先の概要
        supplier_summary: `
            SELECT 
                COUNT(DISTINCT p.supplier) as total_suppliers,
                COUNT(DISTINCT CASE 
                    WHEN isc.shortage_quantity > 0 THEN p.supplier 
                END) as suppliers_with_shortages,
                COUNT(DISTINCT CASE 
                    WHEN sr.status = '入荷予定' 
                         AND sr.scheduled_date < CURDATE() THEN p.supplier 
                END) as suppliers_with_delays
            FROM parts p
            LEFT JOIN inventory_sufficiency_check isc ON p.part_code = isc.part_code
            LEFT JOIN scheduled_receipts sr ON p.part_code = sr.part_code
            WHERE p.is_active = TRUE
        `
    };

    // クエリの実行結果を格納する変数
    let completed = 0;
    const results = {};
    let hasError = false;

    // 各クエリを並列実行
    Object.keys(queries).forEach(key => {
        req.db.query(queries[key], (err, queryResults) => {
            if (err && !hasError) {
                hasError = true;
                console.error(`帳票ダッシュボード取得エラー (${key}):`, err);
                return res.status(500).json({
                    success: false,
                    message: 'データベースエラーが発生しました',
                    error: err.message
                });
            }

            if (!hasError) {
                results[key] = queryResults[0] || {};
                completed++;

                // 全てのクエリが完了したら結果を返す
                if (completed === Object.keys(queries).length) {
                    res.json({
                        success: true,
                        data: {
                            report_info: {
                                report_type: '帳票ダッシュボード',
                                generated_at: new Date().toISOString(),
                                description: '全帳票機能のサマリー情報。管理画面用。'
                            },
                            summary: {
                                shortage_parts: {
                                    total: parseInt(results.shortage_summary.total_shortage_parts) || 0,
                                    emergency: parseInt(results.shortage_summary.emergency_parts) || 0,
                                    warning: parseInt(results.shortage_summary.warning_parts) || 0,
                                    total_cost: parseFloat(results.shortage_summary.total_shortage_cost) || 0
                                },
                                scheduled_receipts: {
                                    total: parseInt(results.receipts_summary.total_scheduled_receipts) || 0,
                                    pending_response: parseInt(results.receipts_summary.pending_response) || 0,
                                    delayed: parseInt(results.receipts_summary.delayed_receipts) || 0,
                                    urgent: parseInt(results.receipts_summary.urgent_receipts) || 0
                                },
                                suppliers: {
                                    total: parseInt(results.supplier_summary.total_suppliers) || 0,
                                    with_shortages: parseInt(results.supplier_summary.suppliers_with_shortages) || 0,
                                    with_delays: parseInt(results.supplier_summary.suppliers_with_delays) || 0
                                }
                            },
                            quick_links: {
                                shortage_reports: [
                                    { name: '不足部品リスト', path: '/api/reports/shortage-parts' },
                                    { name: '仕入先別不足サマリー', path: '/api/reports/shortage-parts/by-supplier' },
                                    { name: '簡易不足リスト', path: '/api/reports/shortage-parts/simple' }
                                ],
                                receipt_reports: [
                                    { name: '予定入荷レポート', path: '/api/reports/scheduled-receipts' },
                                    { name: '納期回答待ちリスト', path: '/api/reports/scheduled-receipts/pending-response' },
                                    { name: '入荷遅延アラート', path: '/api/reports/scheduled-receipts/delayed' },
                                    { name: '仕入先別予定入荷', path: '/api/reports/scheduled-receipts/by-supplier' }
                                ]
                            }
                        }
                    });
                }
            }
        });
    });
});

/**
 * API一覧表示 - 開発用
 * GET /api/reports/
 */
router.get('/', (req, res) => {
    res.json({
        success: true,
        data: {
            api_info: {
                title: '在庫管理システム - 帳票出力API',
                version: '1.0.0',
                description: '生産計画・調達管理に必要な各種帳票を出力'
            },
            available_endpoints: {
                dashboard: {
                    path: '/api/reports/dashboard',
                    method: 'GET',
                    description: '全帳票のサマリー情報'
                },
                shortage_reports: {
                    base_path: '/api/reports/shortage-parts',
                    endpoints: [
                        { path: '/', method: 'GET', description: '不足部品リスト（基本版）' },
                        { path: '/by-supplier', method: 'GET', description: '仕入先別不足部品サマリー' },
                        { path: '/simple', method: 'GET', description: '不足部品リスト（簡易版）' },
                        { path: '/:part_code', method: 'GET', description: '部品別不足詳細' }
                    ]
                },
                receipt_reports: {
                    base_path: '/api/reports/scheduled-receipts',
                    endpoints: [
                        { path: '/', method: 'GET', description: '予定入荷レポート（全体概要）' },
                        { path: '/pending-response', method: 'GET', description: '納期回答待ち部品リスト' },
                        { path: '/delayed', method: 'GET', description: '入荷遅延アラート' },
                        { path: '/by-supplier', method: 'GET', description: '仕入先別予定入荷サマリー' }
                    ]
                }
            },
        }
    });
});

module.exports = router;