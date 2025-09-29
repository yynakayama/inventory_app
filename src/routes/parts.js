// ==========================================
// 部品マスタ関連API
// ファイル: src/routes/parts.js
// 目的: 部品マスタの管理（参照・登録・更新・削除）
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { 
  authenticateToken, 
  requireAdmin, 
  requireReadAccess 
} = require('../middleware/auth');

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
// 認証不要エンドポイント（参照系の一部）
// ==========================================

// 1. 部品カテゴリ一覧取得 GET /api/parts/categories
// 認証不要 - システム設定情報のため
router.get('/categories', async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📋 部品カテゴリ一覧取得開始`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            SELECT
                category_code,
                category_name
            FROM part_categories
            WHERE is_active = TRUE
            ORDER BY category_code
        `;
        
        const [results] = await connection.execute(query);
        
        console.log(`✅ 部品カテゴリ一覧取得完了: ${results.length}件`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `部品カテゴリを${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 部品カテゴリ一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品カテゴリ一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 2. 部品コード体系チェック GET /api/parts/code-patterns
// 認証不要 - コード命名規則の参照のため
router.get('/code-patterns', async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📋 部品コード体系取得開始`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            SELECT 
                SUBSTRING_INDEX(part_code, '-', 1) as code_prefix,
                COUNT(*) as count,
                GROUP_CONCAT(part_code ORDER BY part_code SEPARATOR ',') as examples
            FROM parts
            WHERE is_active = TRUE
            GROUP BY SUBSTRING_INDEX(part_code, '-', 1)
            ORDER BY count DESC
        `;
        
        const [results] = await connection.execute(query);
        
        console.log(`✅ 部品コード体系取得完了: ${results.length}種類`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            message: '部品コードの命名体系を表示'
        });

    } catch (error) {
        console.error('❌ 部品コード体系取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品コード体系の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 認証必要エンドポイント（要ログイン）
// ==========================================

// 3. 部品一覧取得 GET /api/parts
// 🔐 認証必須 - 全ロール参照可能
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { search, category, limit = '100' } = req.query;
        
        console.log(`[${new Date().toISOString()}] 📋 部品一覧取得開始: ユーザー=${req.user.username}, 検索=${search || 'なし'}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        let query = `
            SELECT 
                part_code,
                specification,
                unit,
                lead_time_days,
                safety_stock,
                supplier,
                category,
                unit_price,
                created_at,
                updated_at
            FROM parts 
            WHERE is_active = TRUE
        `;
        
        const params = [];
        
        // 検索条件追加（部品コードまたは仕様での検索）
        if (search && search.trim()) {
            query += ` AND (part_code LIKE ? OR specification LIKE ?)`;
            const searchPattern = `%${search.trim()}%`;
            params.push(searchPattern, searchPattern);
        }
        
        // カテゴリフィルター
        if (category && category.trim()) {
            query += ` AND category = ?`;
            params.push(category.trim());
        }
        
        // LIMIT句は動的パラメータを避けて直接埋め込み
        const limitNum = parseInt(limit) || 100;
        if (limitNum > 0 && limitNum <= 1000) {
            query += ` ORDER BY part_code LIMIT ${limitNum}`;
        } else {
            query += ` ORDER BY part_code LIMIT 100`;
        }
        
        const [results] = await connection.execute(query, params);
        
        console.log(`✅ 部品一覧取得完了: ${results.length}件`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            search_params: { search, category, limit: limitNum },
            requested_by: req.user.username,
            message: `部品一覧を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 部品一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 4. 特定部品取得 GET /api/parts/:code
// 🔐 認証必須 - 全ロール参照可能
router.get('/:code', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const partCode = req.params.code;
        
        console.log(`[${new Date().toISOString()}] 🔍 部品詳細取得開始: ユーザー=${req.user.username}, 部品=${partCode}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            SELECT 
                part_code,
                specification,
                unit,
                lead_time_days,
                safety_stock,
                supplier,
                category,
                unit_price,
                remarks,
                created_at,
                updated_at
            FROM parts 
            WHERE part_code = ? AND is_active = TRUE
        `;
        
        const [results] = await connection.execute(query, [partCode]);
        
        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: `部品コード「${partCode}」は存在しません`,
                error: 'PART_NOT_FOUND',
                part_code: partCode
            });
        }
        
        console.log(`✅ 部品詳細取得完了: ${partCode}`);
        
        res.json({
            success: true,
            data: results[0],
            requested_by: req.user.username,
            message: `部品 ${partCode} の詳細情報を取得しました`
        });

    } catch (error) {
        console.error('❌ 部品詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 管理者専用エンドポイント（admin のみ）
// ==========================================

// 5. 新規部品登録 POST /api/parts (Upsert対応)
// 🔐 管理者のみ - 部品マスタの追加権限
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    
    try {
        const {
            part_code,
            specification,
            unit = '個',
            lead_time_days = 7,
            safety_stock = 0,
            supplier,
            category = 'MECH',
            unit_price = 0.00,
            remarks
        } = req.body;
        
        // 必須項目チェック
        if (!part_code || part_code.trim() === '') {
            return res.status(400).json({
                success: false,
                message: '部品コードは必須です',
                error: 'MISSING_PART_CODE'
            });
        }
        
        const trimmedPartCode = part_code.trim();
        console.log(`[${new Date().toISOString()}] ➕ 部品登録/更新開始: ユーザー=${req.user.username}, 部品=${trimmedPartCode}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 既存レコードをロックして取得 (is_activeに関わらず)
        const [existing] = await connection.execute(
            'SELECT * FROM parts WHERE part_code = ? FOR UPDATE',
            [trimmedPartCode]
        );

        if (existing.length > 0) {
            // レコードが存在する場合
            const part = existing[0];
            if (part.is_active) {
                // 既に有効な部品が存在する場合はエラー
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: `部品コード「${trimmedPartCode}」は既に存在します`,
                    error: 'DUPLICATE_PART_CODE'
                });
            } else {
                // 論理削除済みの場合は更新して復活させる
                console.log(`[${new Date().toISOString()}] ♻️ 論理削除済み部品を更新・復活: ${trimmedPartCode}`);
                const updateQuery = `
                    UPDATE parts SET
                        specification = ?, unit = ?, lead_time_days = ?, safety_stock = ?,
                        supplier = ?, category = ?, unit_price = ?, remarks = ?,
                        is_active = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE part_code = ?
                `;
                const updateValues = [
                    specification ? specification.trim() : null, unit, lead_time_days,
                    safety_stock, supplier ? supplier.trim() : null, category,
                    unit_price, remarks ? remarks.trim() : null, trimmedPartCode
                ];
                await connection.execute(updateQuery, updateValues);
                await connection.commit();

                res.status(200).json({
                    success: true,
                    message: '削除済みの部品を更新し、再度有効化しました',
                    data: { part_code: trimmedPartCode, updated_by: req.user.username, reactivated: true }
                });
            }
        } else {
            // レコードが存在しない場合は新規登録
            console.log(`[${new Date().toISOString()}] ✨ 新規部品を登録: ${trimmedPartCode}`);
            const insertQuery = `
                INSERT INTO parts (
                    part_code, specification, unit, lead_time_days, safety_stock,
                    supplier, category, unit_price, remarks
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const insertValues = [
                trimmedPartCode, specification ? specification.trim() : null, unit,
                lead_time_days, safety_stock, supplier ? supplier.trim() : null,
                category, unit_price, remarks ? remarks.trim() : null
            ];
            await connection.execute(insertQuery, insertValues);

            // 在庫テーブルにも初期レコードを作成
            const inventoryQuery = `
                INSERT INTO inventory (part_code, current_stock, reserved_stock, safety_stock)
                VALUES (?, 0, 0, ?)
            `;
            await connection.execute(inventoryQuery, [trimmedPartCode, safety_stock]);

            await connection.commit();

            res.status(201).json({
                success: true,
                message: '部品を登録しました',
                data: { part_code: trimmedPartCode, created_by: req.user.username }
            });
        }

    } catch (error) {
        if (connection) await connection.rollback();
        console.error('❌ 部品登録/更新エラー:', error);
        
        // ER_DUP_ENTRYはSELECT FOR UPDATEでハンドルされるため、基本的には到達しないはず
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                success: false,
                message: `部品コード「${req.body.part_code}」は既に存在します`,
                error: 'DUPLICATE_PART_CODE'
            });
        }
        
        res.status(500).json({
            success: false,
            message: '部品登録中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 6. 部品更新 PUT /api/parts/:code
// 🔐 管理者のみ - 部品マスタの編集権限
router.put('/:code', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    
    try {
        const partCode = req.params.code;
        const {
            specification,
            unit,
            lead_time_days,
            safety_stock,
            supplier,
            category,
            unit_price,
            remarks
        } = req.body;
        
        console.log(`[${new Date().toISOString()}] ✏️ 部品更新開始: ユーザー=${req.user.username}, 部品=${partCode}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            UPDATE parts SET
                specification = ?,
                unit = ?,
                lead_time_days = ?,
                safety_stock = ?,
                supplier = ?,
                category = ?,
                unit_price = ?,
                remarks = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE part_code = ? AND is_active = TRUE
        `;
        
        const values = [
            specification ? specification.trim() : null,
            unit,
            lead_time_days,
            safety_stock,
            supplier ? supplier.trim() : null,
            category,
            unit_price,
            remarks ? remarks.trim() : null,
            partCode
        ];
        
        const [result] = await connection.execute(query, values);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: `部品コード「${partCode}」は存在しません`,
                error: 'PART_NOT_FOUND'
            });
        }
        
        console.log(`✅ 部品更新完了: ${partCode} by ${req.user.username} (${req.user.role})`);
        
        res.json({
            success: true,
            message: '部品を更新しました',
            data: { 
                part_code: partCode,
                updated_by: req.user.username
            }
        });

    } catch (error) {
        console.error('❌ 部品更新エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品更新中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 7. 部品削除 DELETE /api/parts/:code（論理削除）
// 🔐 管理者のみ - 部品マスタの削除権限
router.delete('/:code', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    
    try {
        const partCode = req.params.code;
        
        console.log(`[${new Date().toISOString()}] 🗑️ 部品削除開始: ユーザー=${req.user.username}, 部品=${partCode}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        const query = `
            UPDATE parts SET 
                is_active = FALSE,
                updated_at = CURRENT_TIMESTAMP
            WHERE part_code = ? AND is_active = TRUE
        `;
        
        const [result] = await connection.execute(query, [partCode]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: `部品コード「${partCode}」は存在しません`,
                error: 'PART_NOT_FOUND'
            });
        }
        
        console.log(`✅ 部品削除完了: ${partCode} by ${req.user.username} (${req.user.role})`);
        
        res.json({
            success: true,
            message: '部品を削除しました',
            data: { 
                part_code: partCode,
                deleted_by: req.user.username
            }
        });

    } catch (error) {
        console.error('❌ 部品削除エラー:', error);
        res.status(500).json({
            success: false,
            message: '部品削除中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;