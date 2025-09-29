// ==========================================
// 部品カテゴリマスタ関連API
// ファイル: src/routes/categories.js
// 目的: 部品カテゴリマスタの管理（参照・登録・更新・削除）
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
// 1. カテゴリ一覧取得 GET /api/categories
// ==========================================
router.get('/', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;

    try {
        console.log(`[${new Date().toISOString()}] 📋 カテゴリ一覧取得開始: ユーザー=${req.user.username}`);

        connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT
                category_code,
                category_name,
                is_active,
                created_at
            FROM part_categories
            ORDER BY category_code
        `;

        const [results] = await connection.execute(query);

        console.log(`✅ カテゴリ一覧取得完了: ${results.length}件`);

        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `カテゴリを${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ カテゴリ一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: 'カテゴリ一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. カテゴリ詳細取得 GET /api/categories/:code
// ==========================================
router.get('/:code', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;

    try {
        const { code } = req.params;
        console.log(`[${new Date().toISOString()}] 📋 カテゴリ詳細取得開始: コード=${code}`);

        connection = await mysql.createConnection(dbConfig);

        const query = `
            SELECT
                category_code,
                category_name,
                is_active,
                created_at
            FROM part_categories
            WHERE category_code = ?
        `;

        const [results] = await connection.execute(query, [code]);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'カテゴリが見つかりません'
            });
        }

        console.log(`✅ カテゴリ詳細取得完了: ${code}`);

        res.json({
            success: true,
            data: results[0],
            message: 'カテゴリ詳細を取得しました'
        });

    } catch (error) {
        console.error('❌ カテゴリ詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: 'カテゴリ詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. カテゴリ新規登録 POST /api/categories
// ==========================================
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    let connection;

    try {
        const { category_code, category_name, is_active = true } = req.body;

        // バリデーション
        if (!category_code || !category_name) {
            return res.status(400).json({
                success: false,
                message: 'カテゴリコードとカテゴリ名は必須です'
            });
        }

        console.log(`[${new Date().toISOString()}] 📝 カテゴリ新規登録開始: コード=${category_code}, ユーザー=${req.user.username}`);

        connection = await mysql.createConnection(dbConfig);

        // 重複チェック
        const checkQuery = 'SELECT category_code FROM part_categories WHERE category_code = ?';
        const [existing] = await connection.execute(checkQuery, [category_code]);

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'このカテゴリコードは既に存在します'
            });
        }

        const insertQuery = `
            INSERT INTO part_categories (
                category_code,
                category_name,
                is_active
            ) VALUES (?, ?, ?)
        `;

        await connection.execute(insertQuery, [
            category_code,
            category_name,
            is_active
        ]);

        console.log(`✅ カテゴリ新規登録完了: ${category_code}`);

        res.status(201).json({
            success: true,
            message: 'カテゴリを正常に登録しました',
            data: {
                category_code,
                category_name,
                is_active
            }
        });

    } catch (error) {
        console.error('❌ カテゴリ新規登録エラー:', error);
        res.status(500).json({
            success: false,
            message: 'カテゴリの登録中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 4. カテゴリ更新 PUT /api/categories/:code
// ==========================================
router.put('/:code', authenticateToken, requireAdmin, async (req, res) => {
    let connection;

    try {
        const { code } = req.params;
        const { category_name, is_active } = req.body;

        // バリデーション
        if (!category_name) {
            return res.status(400).json({
                success: false,
                message: 'カテゴリ名は必須です'
            });
        }

        console.log(`[${new Date().toISOString()}] 📝 カテゴリ更新開始: コード=${code}, ユーザー=${req.user.username}`);

        connection = await mysql.createConnection(dbConfig);

        // 存在チェック
        const checkQuery = 'SELECT category_code FROM part_categories WHERE category_code = ?';
        const [existing] = await connection.execute(checkQuery, [code]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'カテゴリが見つかりません'
            });
        }

        const updateQuery = `
            UPDATE part_categories
            SET category_name = ?, is_active = ?
            WHERE category_code = ?
        `;

        await connection.execute(updateQuery, [
            category_name,
            is_active,
            code
        ]);

        console.log(`✅ カテゴリ更新完了: ${code}`);

        res.json({
            success: true,
            message: 'カテゴリを正常に更新しました',
            data: {
                category_code: code,
                category_name,
                is_active
            }
        });

    } catch (error) {
        console.error('❌ カテゴリ更新エラー:', error);
        res.status(500).json({
            success: false,
            message: 'カテゴリの更新中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 5. カテゴリ削除 DELETE /api/categories/:code
// ==========================================
router.delete('/:code', authenticateToken, requireAdmin, async (req, res) => {
    let connection;

    try {
        const { code } = req.params;

        console.log(`[${new Date().toISOString()}] 🗑️ カテゴリ削除開始: コード=${code}, ユーザー=${req.user.username}`);

        connection = await mysql.createConnection(dbConfig);

        // 存在チェック
        const checkQuery = 'SELECT category_code FROM part_categories WHERE category_code = ?';
        const [existing] = await connection.execute(checkQuery, [code]);

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'カテゴリが見つかりません'
            });
        }

        // 使用中チェック（部品マスタで使用されているかチェック）
        const usageQuery = 'SELECT COUNT(*) as count FROM parts WHERE category = ?';
        const [usageResult] = await connection.execute(usageQuery, [code]);

        if (usageResult[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `このカテゴリは${usageResult[0].count}件の部品で使用中のため削除できません`
            });
        }

        const deleteQuery = 'DELETE FROM part_categories WHERE category_code = ?';
        await connection.execute(deleteQuery, [code]);

        console.log(`✅ カテゴリ削除完了: ${code}`);

        res.json({
            success: true,
            message: 'カテゴリを正常に削除しました'
        });

    } catch (error) {
        console.error('❌ カテゴリ削除エラー:', error);
        res.status(500).json({
            success: false,
            message: 'カテゴリの削除中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;