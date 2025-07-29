// ==========================================
// 帳票出力メインルーター（認証保護対応版）
// ファイル: src/routes/reports/index.js
// 目的: 各種レポート機能への振り分け・ダッシュボード
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
// サブルーターの読み込みと設定
// ==========================================

// 不足部品レポート (/api/reports/shortage-parts/*)
router.use('/shortage-parts', require('./shortage-reports'));

// 予定入荷レポート (/api/reports/scheduled-receipts/*)
router.use('/scheduled-receipts', require('./scheduled-receipts-reports'));

// 棚おろしレポート (/api/reports/stocktaking/*)
router.use('/stocktaking', require('./stocktaking-reports'));

// ==========================================
// メイン帳票API - ダッシュボード用サマリー
// GET /api/reports/dashboard
// 権限: 全ユーザー（認証必須）
// 目的: 全レポートのサマリー情報を一括取得
// ==========================================
router.get('/dashboard', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📊 帳票ダッシュボード取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);

        // 1. 不足部品の概要
        const shortageQuery = `
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
        `;

        // 2. 予定入荷の概要
        const receiptsQuery = `
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
        `;

        // 3. 仕入先の概要
        const supplierQuery = `
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
        `;

        // 4. 棚おろし概要（追加）
        const stocktakingQuery = `
            SELECT 
                COUNT(*) as total_stocktaking_records,
                COUNT(CASE WHEN difference != 0 THEN 1 END) as difference_records,
                ROUND(AVG(ABS(difference)), 2) as avg_difference,
                MAX(stocktaking_date) as latest_stocktaking_date
            FROM stocktaking
            WHERE stocktaking_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        `;

        // 全てのクエリを並列実行
        const [
            [shortageResults],
            [receiptsResults], 
            [supplierResults],
            [stocktakingResults]
        ] = await Promise.all([
            connection.execute(shortageQuery),
            connection.execute(receiptsQuery),
            connection.execute(supplierQuery),
            connection.execute(stocktakingQuery)
        ]);

        const shortageData = shortageResults[0] || {};
        const receiptsData = receiptsResults[0] || {};
        const supplierData = supplierResults[0] || {};
        const stocktakingData = stocktakingResults[0] || {};

        const responseData = {
            report_info: {
                report_type: '帳票ダッシュボード',
                generated_at: new Date().toISOString(),
                generated_by: req.user.username,
                description: '全帳票機能のサマリー情報。管理画面用。'
            },
            summary: {
                shortage_parts: {
                    total: parseInt(shortageData.total_shortage_parts) || 0,
                    emergency: parseInt(shortageData.emergency_parts) || 0,
                    warning: parseInt(shortageData.warning_parts) || 0,
                    total_cost: parseFloat(shortageData.total_shortage_cost) || 0
                },
                scheduled_receipts: {
                    total: parseInt(receiptsData.total_scheduled_receipts) || 0,
                    pending_response: parseInt(receiptsData.pending_response) || 0,
                    delayed: parseInt(receiptsData.delayed_receipts) || 0,
                    urgent: parseInt(receiptsData.urgent_receipts) || 0
                },
                suppliers: {
                    total: parseInt(supplierData.total_suppliers) || 0,
                    with_shortages: parseInt(supplierData.suppliers_with_shortages) || 0,
                    with_delays: parseInt(supplierData.suppliers_with_delays) || 0
                },
                stocktaking: {
                    total_records: parseInt(stocktakingData.total_stocktaking_records) || 0,
                    difference_records: parseInt(stocktakingData.difference_records) || 0,
                    avg_difference: parseFloat(stocktakingData.avg_difference) || 0,
                    latest_date: stocktakingData.latest_stocktaking_date
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
                ],
                stocktaking_reports: [
                    { name: '棚おろし差異レポート', path: '/api/reports/stocktaking' },
                    { name: '差異詳細リスト', path: '/api/reports/stocktaking/differences' },
                    { name: '日付別サマリー', path: '/api/reports/stocktaking/summary' },
                    { name: '部品別履歴', path: '/api/reports/stocktaking/part-history' }
                ]
            }
        };

        console.log(`✅ 帳票ダッシュボード取得完了: 不足部品=${responseData.summary.shortage_parts.total}件, 予定入荷=${responseData.summary.scheduled_receipts.total}件`);

        res.json({
            success: true,
            data: responseData,
            message: '帳票ダッシュボードを取得しました'
        });

    } catch (error) {
        console.error('❌ 帳票ダッシュボード取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '帳票ダッシュボードの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// API一覧表示 - 開発用
// GET /api/reports/
// 権限: 全ユーザー（認証必須）
// 目的: 利用可能なエンドポイント一覧を表示
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] 📋 帳票API一覧取得: ユーザー=${req.user.username}`);

        res.json({
            success: true,
            data: {
                api_info: {
                    title: '在庫管理システム - 帳票出力API',
                    version: '1.0.0',
                    description: '生産計画・調達管理に必要な各種帳票を出力',
                    authenticated_user: req.user.username,
                    user_role: req.user.role
                },
                available_endpoints: {
                    dashboard: {
                        path: '/api/reports/dashboard',
                        method: 'GET',
                        description: '全帳票のサマリー情報',
                        auth_required: true,
                        permissions: '全ユーザー'
                    },
                    shortage_reports: {
                        base_path: '/api/reports/shortage-parts',
                        description: '不足部品関連レポート',
                        endpoints: [
                            { path: '/', method: 'GET', description: '不足部品リスト（基本版）' },
                            { path: '/by-supplier', method: 'GET', description: '仕入先別不足部品サマリー' },
                            { path: '/simple', method: 'GET', description: '不足部品リスト（簡易版）' },
                            { path: '/:part_code', method: 'GET', description: '部品別不足詳細' }
                        ]
                    },
                    receipt_reports: {
                        base_path: '/api/reports/scheduled-receipts',
                        description: '予定入荷関連レポート',
                        endpoints: [
                            { path: '/', method: 'GET', description: '予定入荷レポート（全体概要）' },
                            { path: '/pending-response', method: 'GET', description: '納期回答待ち部品リスト' },
                            { path: '/delayed', method: 'GET', description: '入荷遅延アラート' },
                            { path: '/by-supplier', method: 'GET', description: '仕入先別予定入荷サマリー' }
                        ]
                    },
                    stocktaking_reports: {
                        base_path: '/api/reports/stocktaking',
                        description: '棚おろし関連レポート',
                        endpoints: [
                            { path: '/', method: 'GET', description: '棚おろし差異レポート（全体概要）' },
                            { path: '/differences', method: 'GET', description: '棚おろし差異詳細リスト' },
                            { path: '/summary', method: 'GET', description: '棚おろしサマリー（日付別）' },
                            { path: '/part-history', method: 'GET', description: '部品別棚おろし履歴' },
                            { path: '/by-category', method: 'GET', description: 'カテゴリ別差異分析' }
                        ]
                    }
                },
                usage_notes: {
                    authentication: 'すべてのエンドポイントで認証が必要です',
                    authorization: 'Bearer トークンをAuthorizationヘッダーに含めてください',
                    permissions: '全ユーザーが参照可能です（requireReadAccess）'
                }
            },
            message: '帳票API一覧を取得しました'
        });

    } catch (error) {
        console.error('❌ 帳票API一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: 'API一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;