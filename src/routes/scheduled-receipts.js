// ==========================================
// 予定入荷管理API（認証保護・DB統一対応版）
// ファイル: src/routes/scheduled-receipts.js
// 目的: 発注管理、納期回答、入荷実績管理
// 統一パターン: mysql2/promise + 認証保護 + エラーハンドリング強化
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireMaterialAccess, requireReadAccess } = require('../middleware/auth');

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
// 1. 予定入荷一覧取得
// GET /api/scheduled-receipts
// 権限: 全ユーザー（参照系）
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { status, part_code, from_date, to_date } = req.query;
        
        let whereConditions = [];
        let params = [];
        
        // ステータスフィルタ
        if (status) {
            whereConditions.push('sr.status = ?');
            params.push(status);
        }
        
        // 部品コードフィルタ
        if (part_code) {
            whereConditions.push('sr.part_code LIKE ?');
            params.push(`%${part_code}%`);
        }
        
        // 予定入荷日範囲フィルタ
        if (from_date) {
            whereConditions.push('sr.scheduled_date >= ?');
            params.push(from_date);
        }
        if (to_date) {
            whereConditions.push('sr.scheduled_date <= ?');
            params.push(to_date);
        }
        
        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}` 
            : '';
        
        const query = `
            SELECT 
                sr.id,
                sr.order_no,
                sr.part_code,
                p.specification,
                sr.supplier,
                sr.order_quantity,
                sr.scheduled_quantity,
                sr.order_date,
                sr.scheduled_date,
                sr.status,
                sr.remarks,
                sr.created_at,
                sr.updated_at,
                -- 利用可能在庫計算用の現在在庫も取得
                i.current_stock,
                i.reserved_stock
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            LEFT JOIN inventory i ON sr.part_code = i.part_code
            ${whereClause}
            ORDER BY sr.scheduled_date ASC, sr.created_at DESC
        `;
        
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query, params);
        
        console.log(`[${new Date().toISOString()}] 予定入荷一覧取得: ユーザー=${req.user.username}, 件数=${results.length}`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `予定入荷情報を${results.length}件取得しました`
        });
        
    } catch (error) {
        console.error('❌ 予定入荷一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '予定入荷一覧の取得に失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 入荷予定詳細取得
// GET /api/scheduled-receipts/:id
// 権限: 全ユーザー（参照系）
// ==========================================
router.get('/:id', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                sr.*,
                p.specification,
                p.category,
                p.lead_time_days,
                p.unit_price,
                i.current_stock,
                i.reserved_stock
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            LEFT JOIN inventory i ON sr.part_code = i.part_code
            WHERE sr.id = ?
        `;
        
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query, [id]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された入荷予定が見つかりません'
            });
        }
        
        console.log(`[${new Date().toISOString()}] 入荷予定詳細取得: ユーザー=${req.user.username}, ID=${id}`);
        
        res.json({
            success: true,
            data: results[0],
            message: '入荷予定詳細を取得しました'
        });
        
    } catch (error) {
        console.error('❌ 入荷予定詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '入荷予定詳細の取得に失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. 発注登録
// POST /api/scheduled-receipts
// 権限: 資材管理権限（admin, material_staff）
// ==========================================
router.post('/', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code, order_quantity, requested_date, remarks } = req.body;
        
        // バリデーション
        if (!part_code || !order_quantity || order_quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '部品コードと発注数量（正の数）は必須です'
            });
        }
        
        // undefinedパラメータをnullに変換
        const safeRequestedDate = requested_date || null;
        const safeRemarks = remarks || null;
        const safeUsername = req.user?.username || null;
        
        connection = await mysql.createConnection(dbConfig);
        
        // まず部品マスタから仕入先情報を取得
        const [partResults] = await connection.execute(
            'SELECT supplier FROM parts WHERE part_code = ? AND is_active = TRUE',
            [part_code]
        );
        
        if (partResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された部品コードが見つかりません'
            });
        }
        
        const supplier = partResults[0].supplier || '仕入先未設定';
        
        // 発注登録（order_noはトリガーで自動採番）
        const [insertResult] = await connection.execute(`
            INSERT INTO scheduled_receipts (
                part_code,
                supplier,
                order_quantity,
                order_date,
                remarks,
                created_by
            ) VALUES (?, ?, ?, CURDATE(), ?, ?)
        `, [part_code, supplier, order_quantity, safeRemarks, safeUsername]);
        
        // 登録された発注情報を取得
        const [newOrder] = await connection.execute(`
            SELECT 
                sr.*,
                p.specification
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            WHERE sr.id = ?
        `, [insertResult.insertId]);
        
        console.log(`[${new Date().toISOString()}] 発注登録: ユーザー=${req.user.username}, 部品=${part_code}, 数量=${order_quantity}`);
        
        res.status(201).json({
            success: true,
            data: newOrder[0],
            message: '発注を登録しました'
        });
        
    } catch (error) {
        console.error('❌ 発注登録エラー:', error);
        res.status(500).json({
            success: false,
            message: '発注登録に失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 4. 納期回答登録（予定数量・予定日更新）
// PUT /api/scheduled-receipts/:id/delivery-response
// 権限: 資材管理権限（admin, material_staff）
// ==========================================
router.put('/:id/delivery-response', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        const { scheduled_quantity, scheduled_date, remarks } = req.body;
        
        // バリデーション
        if (!scheduled_quantity || scheduled_quantity <= 0 || !scheduled_date) {
            return res.status(400).json({
                success: false,
                message: '予定入荷数量（正の数）と予定入荷日は必須です'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 現在の発注状態を確認
        const [orderResults] = await connection.execute(
            'SELECT * FROM scheduled_receipts WHERE id = ?',
            [id]
        );
        
        if (orderResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された発注が見つかりません'
            });
        }
        
        const currentOrder = orderResults[0];
        
        // 納期回答待ち状態のみ更新可能
        if (currentOrder.status !== '納期回答待ち') {
            return res.status(400).json({
                success: false,
                message: `ステータスが「納期回答待ち」の発注のみ納期回答できます（現在: ${currentOrder.status}）`
            });
        }
        
        // 納期回答を更新
        await connection.execute(`
            UPDATE scheduled_receipts 
            SET 
                scheduled_quantity = ?,
                scheduled_date = ?,
                status = '入荷予定',
                remarks = CONCAT(COALESCE(remarks, ''), '\n納期回答: ', ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [scheduled_quantity, scheduled_date, remarks || '納期回答済み', id]);
        
        // 更新後の情報を取得
        const [updatedOrder] = await connection.execute(`
            SELECT 
                sr.*,
                p.specification
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            WHERE sr.id = ?
        `, [id]);
        
        console.log(`[${new Date().toISOString()}] 納期回答登録: ユーザー=${req.user.username}, 発注ID=${id}, 予定数量=${scheduled_quantity}`);
        
        res.json({
            success: true,
            data: updatedOrder[0],
            message: '納期回答を登録しました'
        });
        
    } catch (error) {
        console.error('❌ 納期回答登録エラー:', error);
        res.status(500).json({
            success: false,
            message: '納期回答登録に失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 5. 入荷実績との照合（予定入荷ステータス更新のみ）
// PUT /api/scheduled-receipts/:id/mark-received
// 権限: 資材管理権限（admin, material_staff）
// 注意: 実際の在庫更新は /api/inventory/:part_code/receipt で別途実行
// ==========================================
router.put('/:id/mark-received', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        const { actual_quantity, receipt_date, remarks } = req.body;
        
        // バリデーション
        if (!actual_quantity || actual_quantity <= 0 || !receipt_date) {
            return res.status(400).json({
                success: false,
                message: '実入荷数量（正の数）と入荷日は必須です'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 現在の予定入荷状態を確認
        const [orderResults] = await connection.execute(
            'SELECT * FROM scheduled_receipts WHERE id = ?',
            [id]
        );
        
        if (orderResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された入荷予定が見つかりません'
            });
        }
        
        const currentOrder = orderResults[0];
        
        // 入荷予定状態のみ処理可能
        if (currentOrder.status !== '入荷予定') {
            return res.status(400).json({
                success: false,
                message: `ステータスが「入荷予定」の発注のみ入荷処理できます（現在: ${currentOrder.status}）`
            });
        }
        
        // 予定入荷を入荷済みに更新
        await connection.execute(`
            UPDATE scheduled_receipts 
            SET 
                status = '入荷済み',
                remarks = CONCAT(COALESCE(remarks, ''), '\n入荷実績: ', ?, '個 (', ?, ')'),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [actual_quantity, receipt_date, remarks || '入荷完了', id]);
        
        // 更新後の情報を取得
        const [updatedOrder] = await connection.execute(`
            SELECT 
                sr.*,
                p.specification
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            WHERE sr.id = ?
        `, [id]);
        
        console.log(`[${new Date().toISOString()}] 入荷実績反映: ユーザー=${req.user.username}, 発注ID=${id}, 実績数量=${actual_quantity}`);
        
        res.json({
            success: true,
            data: updatedOrder[0],
            message: '入荷実績を反映しました',
            warning: '⚠️ 在庫数量の更新は /api/inventory/' + currentOrder.part_code + '/receipt で別途実行してください'
        });
        
    } catch (error) {
        console.error('❌ 入荷実績処理エラー:', error);
        res.status(500).json({
            success: false,
            message: '入荷実績処理に失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 6. 発注キャンセル
// PUT /api/scheduled-receipts/:id/cancel
// 権限: 資材管理権限（admin, material_staff）
// ==========================================
router.put('/:id/cancel', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 現在の発注状態を確認
        const [orderResults] = await connection.execute(
            'SELECT * FROM scheduled_receipts WHERE id = ?',
            [id]
        );
        
        if (orderResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された発注が見つかりません'
            });
        }
        
        const currentOrder = orderResults[0];
        
        // 入荷済み以外はキャンセル可能
        if (currentOrder.status === '入荷済み') {
            return res.status(400).json({
                success: false,
                message: '入荷済みの発注はキャンセルできません'
            });
        }
        
        // 発注をキャンセル状態に更新
        await connection.execute(`
            UPDATE scheduled_receipts 
            SET 
                status = 'キャンセル',
                remarks = CONCAT(COALESCE(remarks, ''), '\nキャンセル理由: ', ?),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [reason || 'キャンセル', id]);
        
        // 更新後の情報を取得
        const [updatedOrder] = await connection.execute(`
            SELECT 
                sr.*,
                p.specification
            FROM scheduled_receipts sr
            JOIN parts p ON sr.part_code = p.part_code
            WHERE sr.id = ?
        `, [id]);
        
        console.log(`[${new Date().toISOString()}] 発注キャンセル: ユーザー=${req.user.username}, 発注ID=${id}, 理由=${reason || 'キャンセル'}`);
        
        res.json({
            success: true,
            data: updatedOrder[0],
            message: '発注をキャンセルしました'
        });
        
    } catch (error) {
        console.error('❌ 発注キャンセルエラー:', error);
        res.status(500).json({
            success: false,
            message: '発注キャンセルに失敗しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;