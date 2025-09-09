// ==========================================
// 在庫管理API
// ファイル: src/routes/inventory.js
// 目的: 在庫データの参照・更新・入出庫処理・履歴管理
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
// 在庫一覧取得API
// GET /api/inventory
// 権限: 全認証ユーザー（参照権限）
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { search, category, low_stock } = req.query;
        
        console.log(`[${new Date().toISOString()}] 📦 在庫一覧取得開始: ユーザー=${req.user.username}, 検索=${search || 'なし'}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        let sql = `
            SELECT 
                i.part_code,
                p.specification,
                p.safety_stock,
                p.lead_time_days,
                p.supplier,
                p.category,
                i.current_stock,
                i.reserved_stock,
                (i.current_stock - i.reserved_stock) as available_stock,
                i.updated_at,
                CASE 
                    WHEN i.current_stock <= COALESCE(p.safety_stock, 0) THEN true 
                    ELSE false 
                END as is_low_stock
            FROM inventory i
            LEFT JOIN parts p ON i.part_code = p.part_code AND p.is_active = true
            WHERE 1=1
        `;
        
        const params = [];
        
        // 検索条件の追加（部品コードまたは仕様で検索）
        if (search && search.trim()) {
            sql += ` AND (i.part_code LIKE ? OR p.specification LIKE ?)`;
            const searchPattern = `%${search.trim()}%`;
            params.push(searchPattern, searchPattern);
        }
        
        // カテゴリフィルタの追加
        if (category && category.trim()) {
            sql += ` AND p.category = ?`;
            params.push(category.trim());
        }
        
        // 安全在庫切れフィルタの追加
        if (low_stock === 'true') {
            sql += ` AND i.current_stock <= COALESCE(p.safety_stock, 0)`;
        }
        
        sql += ` ORDER BY i.part_code`;
        
        const [results] = await connection.execute(sql, params);
        
        console.log(`✅ 在庫一覧取得完了: ${results.length}件（安全在庫割れ: ${results.filter(r => r.is_low_stock).length}件）`);
        
        res.json({
            success: true,
            data: results,
            total: results.length,
            filters: { search, category, low_stock },
            user_info: {
                username: req.user.username,
                role: req.user.role
            },
            message: `在庫一覧を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 在庫一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 在庫予約データ同期API（管理者用）
// POST /api/inventory/sync-reservations
// 権限: admin（管理者権限）
// 目的: inventory_reservationsテーブルからinventoryテーブルのreserved_stockを同期
// ==========================================
router.post('/sync-reservations', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 🔄 在庫予約データ同期開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // inventory_reservationsテーブルからreserved_stockを再計算して更新
        const [result] = await connection.execute(
            `UPDATE inventory i 
             SET reserved_stock = (
                 SELECT COALESCE(SUM(ir.reserved_quantity), 0)
                 FROM inventory_reservations ir 
                 WHERE ir.part_code = i.part_code
             ),
             updated_at = NOW()`
        );
        
        await connection.commit();
        
        console.log(`✅ 在庫予約データ同期完了: ${result.affectedRows}件の部品を更新しました`);
        
        res.json({
            success: true,
            message: '在庫予約データの同期が完了しました',
            data: {
                updated_count: result.affectedRows,
                synced_by: req.user.username,
                synced_at: new Date().toISOString()
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 在庫予約データ同期エラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫予約データの同期中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 特定部品の在庫詳細取得API
// GET /api/inventory/:part_code
// 権限: 全認証ユーザー（参照権限）
// ==========================================
router.get('/:part_code', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        
        console.log(`[${new Date().toISOString()}] 🔍 在庫詳細取得開始: ユーザー=${req.user.username}, 部品=${part_code}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const sql = `
            SELECT 
                i.part_code,
                p.specification,
                COALESCE(p.safety_stock, 0) as safety_stock,
                COALESCE(p.lead_time_days, 0) as lead_time_days,
                p.supplier,
                p.category,
                p.unit_price,
                i.current_stock,
                COALESCE(SUM(ir.reserved_quantity), 0) as reserved_stock,
                (i.current_stock - COALESCE(SUM(ir.reserved_quantity), 0)) as available_stock,
                i.updated_at,
                CASE 
                    WHEN i.current_stock <= COALESCE(p.safety_stock, 0) THEN true 
                    ELSE false 
                END as is_low_stock
            FROM inventory i
            LEFT JOIN parts p ON i.part_code = p.part_code AND p.is_active = true
            LEFT JOIN inventory_reservations ir ON i.part_code = ir.part_code
            WHERE i.part_code = ?
            GROUP BY 
                i.part_code, p.specification, p.safety_stock, p.lead_time_days, 
                p.supplier, p.category, p.unit_price, i.current_stock, i.updated_at
        `;
        
        const [results] = await connection.execute(sql, [part_code]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された部品の在庫情報が見つかりません',
                error: 'INVENTORY_NOT_FOUND',
                part_code: part_code
            });
        }
        
        console.log(`✅ 在庫詳細取得完了: ${part_code} (在庫: ${results[0].current_stock})`);
        
        res.json({
            success: true,
            data: results[0],
            message: `部品 ${part_code} の在庫詳細を取得しました`
        });

    } catch (error) {
        console.error('❌ 在庫詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 在庫数量更新API（手動調整）
// PUT /api/inventory/:part_code
// 権限: admin + material_staff（資材管理権限）
// ==========================================
router.put('/:part_code', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { current_stock, reason = '手動調整' } = req.body;
        
        // バリデーション
        if (typeof current_stock !== 'number' || current_stock < 0) {
            return res.status(400).json({
                success: false,
                message: '在庫数量は0以上の数値で入力してください',
                error: 'INVALID_STOCK_VALUE'
            });
        }
        
        console.log(`[${new Date().toISOString()}] ✏️ 在庫更新開始: ユーザー=${req.user.username}, 部品=${part_code}, 新在庫=${current_stock}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // 現在の在庫情報を取得
        const [currentResults] = await connection.execute(
            'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?',
            [part_code]
        );
        
        if (currentResults.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '指定された部品が見つかりません',
                error: 'PART_NOT_FOUND'
            });
        }
        
        const oldStock = currentResults[0].current_stock;
        const reservedStock = currentResults[0].reserved_stock;
        
        // 在庫マイナス防止チェック（予約在庫考慮）
        if (current_stock < reservedStock) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `在庫数量は予約済み在庫（${reservedStock}）以上である必要があります`,
                error: 'INSUFFICIENT_STOCK'
            });
        }
        
        // 在庫数量を更新
        await connection.execute(
            'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
            [current_stock, part_code]
        );
        
        // 在庫履歴を記録
        const stockDifference = current_stock - oldStock;
        const historyRemarks = `${reason} (実行者: ${req.user.username})`;
        
        await connection.execute(
            `INSERT INTO inventory_transactions 
             (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [part_code, '手動調整', stockDifference, oldStock, current_stock, historyRemarks, req.user.username]
        );
        
        await connection.commit();
        
        console.log(`✅ 在庫更新完了: ${part_code} ${oldStock} → ${current_stock} by ${req.user.username}`);
        
        res.json({
            success: true,
            message: '在庫数量を更新しました',
            data: {
                part_code,
                old_stock: oldStock,
                new_stock: current_stock,
                difference: stockDifference,
                updated_by: req.user.username
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 在庫更新エラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫更新中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 入荷処理API
// POST /api/inventory/:part_code/receipt
// 権限: admin + material_staff（資材管理権限）
// ==========================================
router.post('/:part_code/receipt', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { quantity, supplier = '', remarks = '' } = req.body;
        
        // バリデーション
        if (typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '入荷数量は1以上の数値で入力してください',
                error: 'INVALID_QUANTITY'
            });
        }
        
        console.log(`[${new Date().toISOString()}] 📥 入荷処理開始: ユーザー=${req.user.username}, 部品=${part_code}, 数量=${quantity}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // 部品マスタの存在確認
        const [partResults] = await connection.execute(
            'SELECT part_code FROM parts WHERE part_code = ? AND is_active = true',
            [part_code]
        );
        
        if (partResults.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '指定された部品が見つかりません',
                error: 'PART_NOT_FOUND'
            });
        }
        
        // 在庫レコードの存在確認・作成
        const [inventoryResults] = await connection.execute(
            'SELECT current_stock FROM inventory WHERE part_code = ?',
            [part_code]
        );
        
        let currentStock = 0;
        
        if (inventoryResults.length === 0) {
            // 在庫レコードが存在しない場合は新規作成
            await connection.execute(
                'INSERT INTO inventory (part_code, current_stock, reserved_stock, updated_at) VALUES (?, 0, 0, NOW())',
                [part_code]
            );
        } else {
            currentStock = inventoryResults[0].current_stock;
        }
        
        const newStock = currentStock + quantity;
        
        // 在庫数量を更新
        await connection.execute(
            'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
            [newStock, part_code]
        );
        
        // 在庫トランザクション履歴を記録
        const historyRemarks = `入荷処理: ${remarks}${supplier ? ` (仕入先: ${supplier})` : ''} (実行者: ${req.user.username})`;
        
        await connection.execute(
            `INSERT INTO inventory_transactions 
             (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [part_code, '入荷', quantity, currentStock, newStock, historyRemarks, req.user.username]
        );
        
        await connection.commit();
        
        console.log(`✅ 入荷処理完了: ${part_code} ${currentStock} → ${newStock} (+${quantity}) by ${req.user.username}`);
        
        res.json({
            success: true,
            message: '入荷処理が完了しました',
            data: {
                part_code,
                receipt_quantity: quantity,
                old_stock: currentStock,
                new_stock: newStock,
                supplier,
                processed_by: req.user.username
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 入荷処理エラー:', error);
        res.status(500).json({
            success: false,
            message: '入荷処理中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 統合入荷処理API（新機能追加）
// POST /api/inventory/:part_code/integrated-receipt
// 権限: admin + material_staff（資材管理権限）
// 目的: 在庫更新と予定入荷ステータス更新を1回のAPIで実行
// ==========================================
router.post('/:part_code/integrated-receipt', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { 
            quantity, 
            supplier = '', 
            receipt_date,
            remarks = '', 
            scheduled_receipt_id = null 
        } = req.body;
        
        // バリデーション
        if (typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '入荷数量は1以上の数値で入力してください',
                error: 'INVALID_QUANTITY'
            });
        }
        
        if (!receipt_date) {
            return res.status(400).json({
                success: false,
                message: '入荷日は必須です',
                error: 'MISSING_RECEIPT_DATE'
            });
        }
        
        console.log(`[${new Date().toISOString()}] 🔄 統合入荷処理開始: ユーザー=${req.user.username}, 部品=${part_code}, 数量=${quantity}, 予定入荷ID=${scheduled_receipt_id || 'なし'}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // 1. 部品マスタの存在確認
        const [partResults] = await connection.execute(
            'SELECT part_code FROM parts WHERE part_code = ? AND is_active = true',
            [part_code]
        );
        
        if (partResults.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '指定された部品が見つかりません',
                error: 'PART_NOT_FOUND'
            });
        }
        
        // 2. 予定入荷IDが指定されている場合の検証
        let scheduledReceiptData = null;
        if (scheduled_receipt_id) {
            const [scheduledResults] = await connection.execute(
                'SELECT * FROM scheduled_receipts WHERE id = ? AND part_code = ?',
                [scheduled_receipt_id, part_code]
            );
            
            if (scheduledResults.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: '指定された予定入荷が見つかりません',
                    error: 'SCHEDULED_RECEIPT_NOT_FOUND'
                });
            }
            
            scheduledReceiptData = scheduledResults[0];
            
            // 入荷予定状態のみ処理可能
            if (scheduledReceiptData.status !== '入荷予定') {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `ステータスが「入荷予定」の発注のみ処理できます（現在: ${scheduledReceiptData.status}）`,
                    error: 'INVALID_SCHEDULED_RECEIPT_STATUS'
                });
            }
        }
        
        // 3. 在庫レコードの存在確認・作成
        const [inventoryResults] = await connection.execute(
            'SELECT current_stock FROM inventory WHERE part_code = ?',
            [part_code]
        );
        
        let currentStock = 0;
        
        if (inventoryResults.length === 0) {
            // 在庫レコードが存在しない場合は新規作成
            await connection.execute(
                'INSERT INTO inventory (part_code, current_stock, reserved_stock, updated_at) VALUES (?, 0, 0, NOW())',
                [part_code]
            );
        } else {
            currentStock = inventoryResults[0].current_stock;
        }
        
        const newStock = currentStock + quantity;
        
        // 4. 在庫数量を更新
        await connection.execute(
            'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
            [newStock, part_code]
        );
        
        // 5. 在庫トランザクション履歴を記録
        const historyRemarks = scheduled_receipt_id 
            ? `統合入荷処理: ${remarks} (予定入荷ID: ${scheduled_receipt_id}, 仕入先: ${supplier}) (実行者: ${req.user.username})`
            : `統合入荷処理: ${remarks}${supplier ? ` (仕入先: ${supplier})` : ''} (実行者: ${req.user.username})`;
        
        await connection.execute(
            `INSERT INTO inventory_transactions 
             (part_code, transaction_type, quantity, before_stock, after_stock, reference_id, remarks, transaction_date, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [part_code, '入荷', quantity, currentStock, newStock, scheduled_receipt_id, historyRemarks, req.user.username]
        );
        
        // 6. 予定入荷ステータス更新（指定された場合のみ）
        let scheduledReceiptUpdate = null;
        if (scheduled_receipt_id && scheduledReceiptData) {
            await connection.execute(`
                UPDATE scheduled_receipts 
                SET 
                    status = '入荷済み',
                    remarks = CONCAT(COALESCE(remarks, ''), '\n統合入荷実績: ', ?, '個 (', ?, ') - 統合処理'),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [quantity, receipt_date, scheduled_receipt_id]);
            
            // 更新後の予定入荷情報を取得
            const [updatedScheduledReceipt] = await connection.execute(`
                SELECT 
                    sr.*,
                    p.specification
                FROM scheduled_receipts sr
                JOIN parts p ON sr.part_code = p.part_code
                WHERE sr.id = ?
            `, [scheduled_receipt_id]);
            
            scheduledReceiptUpdate = {
                id: scheduled_receipt_id,
                order_no: scheduledReceiptData.order_no,
                status_updated: true,
                old_status: scheduledReceiptData.status,
                new_status: '入荷済み',
                scheduled_quantity: scheduledReceiptData.scheduled_quantity,
                actual_quantity: quantity,
                updated_data: updatedScheduledReceipt[0]
            };
        }
        
        await connection.commit();
        
        const logMessage = scheduled_receipt_id 
            ? `✅ 統合入荷処理完了: ${part_code} ${currentStock} → ${newStock} (+${quantity}) 予定入荷ID:${scheduled_receipt_id} by ${req.user.username}`
            : `✅ 統合入荷処理完了: ${part_code} ${currentStock} → ${newStock} (+${quantity}) by ${req.user.username}`;
        
        console.log(logMessage);
        
        // レスポンス構築
        const responseData = {
            part_code,
            receipt_quantity: quantity,
            old_stock: currentStock,
            new_stock: newStock,
            supplier,
            receipt_date,
            processed_by: req.user.username,
            processing_type: scheduled_receipt_id ? 'integrated_with_scheduled_receipt' : 'direct_receipt'
        };
        
        if (scheduledReceiptUpdate) {
            responseData.scheduled_receipt = scheduledReceiptUpdate;
        }
        
        res.json({
            success: true,
            message: scheduled_receipt_id 
                ? '統合入荷処理が完了しました（在庫更新+予定入荷ステータス更新）'
                : '統合入荷処理が完了しました（在庫更新のみ）',
            data: responseData
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                console.log('🔄 トランザクションロールバック実行');
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 統合入荷処理エラー:', error);
        res.status(500).json({
            success: false,
            message: '統合入荷処理中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});


// ==========================================
// 出庫処理API
// POST /api/inventory/:part_code/issue
// 権限: admin + material_staff（資材管理権限）
// ==========================================
router.post('/:part_code/issue', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { quantity, purpose = '生産投入', remarks = '' } = req.body;
        
        // バリデーション
        if (typeof quantity !== 'number' || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '出庫数量は1以上の数値で入力してください',
                error: 'INVALID_QUANTITY'
            });
        }
        
        console.log(`[${new Date().toISOString()}] 📤 出庫処理開始: ユーザー=${req.user.username}, 部品=${part_code}, 数量=${quantity}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        // 現在の在庫情報を取得
        const [inventoryResults] = await connection.execute(
            'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?',
            [part_code]
        );
        
        if (inventoryResults.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '指定された部品の在庫情報が見つかりません',
                error: 'INVENTORY_NOT_FOUND'
            });
        }
        
        const currentStock = inventoryResults[0].current_stock;
        const reservedStock = inventoryResults[0].reserved_stock;
        const availableStock = currentStock - reservedStock;
        
        // 在庫不足チェック
        if (quantity > availableStock) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `利用可能在庫が不足しています（利用可能: ${availableStock}、要求: ${quantity}）`,
                error: 'INSUFFICIENT_AVAILABLE_STOCK'
            });
        }
        
        const newStock = currentStock - quantity;
        
        // 在庫数量を更新
        await connection.execute(
            'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
            [newStock, part_code]
        );
        
        // 在庫トランザクション履歴を記録
        const historyRemarks = `${purpose}: ${remarks} (実行者: ${req.user.username})`;
        
        await connection.execute(
            `INSERT INTO inventory_transactions 
             (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
             VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
            [part_code, '出庫', -quantity, currentStock, newStock, historyRemarks, req.user.username]
        );
        
        await connection.commit();
        
        console.log(`✅ 出庫処理完了: ${part_code} ${currentStock} → ${newStock} (-${quantity}) by ${req.user.username}`);
        
        res.json({
            success: true,
            message: '出庫処理が完了しました',
            data: {
                part_code,
                issue_quantity: quantity,
                old_stock: currentStock,
                new_stock: newStock,
                available_stock: availableStock - quantity,
                purpose,
                processed_by: req.user.username
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 出庫処理エラー:', error);
        res.status(500).json({
            success: false,
            message: '出庫処理中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 在庫履歴取得API
// GET /api/inventory/:part_code/history
// 権限: 全認証ユーザー（参照権限）
// ==========================================
router.get('/:part_code/history', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code } = req.params;
        const { limit = '50' } = req.query;
        
        console.log(`[${new Date().toISOString()}] 📚 在庫履歴取得開始: ユーザー=${req.user.username}, 部品=${part_code}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        // LIMIT句は動的パラメータを避けて直接埋め込み
        const limitNum = parseInt(limit) || 50;
        const safeLimitNum = limitNum > 0 && limitNum <= 500 ? limitNum : 50;
        
        const sql = `
            SELECT 
                id,
                transaction_type,
                quantity,
                before_stock,
                after_stock,
                remarks,
                transaction_date,
                created_by
            FROM inventory_transactions 
            WHERE part_code = ? 
            ORDER BY transaction_date DESC, id DESC
            LIMIT ${safeLimitNum}
        `;
        
        const [results] = await connection.execute(sql, [part_code]);
        
        console.log(`✅ 在庫履歴取得完了: ${part_code} ${results.length}件`);
        
        res.json({
            success: true,
            data: results,
            total: results.length,
            part_code: part_code,
            limit: safeLimitNum,
            message: `部品 ${part_code} の在庫履歴を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 在庫履歴取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '在庫履歴の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;