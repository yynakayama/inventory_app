/**
 * ユーザー管理API
 * 権限: admin のみ
 */

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

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

const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');

/**
 * ユーザー一覧取得
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { search, role, is_active, limit = 50 } = req.query;

        let query = `
            SELECT id, username, email, role, is_active, last_login_at, created_at, updated_at
            FROM users
            WHERE 1=1
        `;
        const params = [];

        if (search) {
            query += ` AND (username LIKE ? OR (email IS NOT NULL AND email LIKE ?))`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (role) {
            query += ` AND role = ?`;
            params.push(role);
        }

        if (is_active !== undefined) {
            query += ` AND is_active = ?`;
            params.push(is_active === 'true');
        }

        const limitValue = Math.min(parseInt(limit) || 50, 500);
        query += ` ORDER BY created_at DESC LIMIT ${limitValue}`;
        // LIMITはプレースホルダーではなく直接埋め込み

        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query, params);

        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `ユーザー一覧を${results.length}件取得しました`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザー一覧の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * ユーザー詳細取得
 */
router.get('/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        const query = `
            SELECT id, username, email, role, is_active, last_login_at, created_at, updated_at
            FROM users
            WHERE id = ?
        `;

        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query, [id]);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたユーザーが見つかりません',
                error: 'RESOURCE_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            data: results[0],
            message: 'ユーザー詳細を取得しました'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザー詳細の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * ユーザー新規作成
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { username, email, password, role, is_active = true } = req.body;

        // バリデーション
        if (!username || !password || !role) {
            return res.status(400).json({
                success: false,
                message: 'ユーザー名、パスワード、権限は必須です',
                errors: [
                    { field: 'username', message: !username ? 'ユーザー名は必須です' : null },
                    { field: 'password', message: !password ? 'パスワードは必須です' : null },
                    { field: 'role', message: !role ? '権限は必須です' : null }
                ].filter(e => e.message)
            });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username) || username.length < 3 || username.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'ユーザー名は3-50文字の英数字とアンダースコアのみ使用できます'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'パスワードは8文字以上である必要があります'
            });
        }

        if (!['admin', 'production_manager', 'material_staff', 'viewer'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: '無効な権限レベルです'
            });
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: '有効なメールアドレスを入力してください'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // ユーザー名重複チェック
        const [existing] = await connection.execute(
            'SELECT username FROM users WHERE username = ?',
            [username]
        );
        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                message: '同じユーザー名が既に存在します',
                error: 'DUPLICATE_ENTRY'
            });
        }

        // メール重複チェック（設定されている場合）
        if (email) {
            const [emailExisting] = await connection.execute(
                'SELECT email FROM users WHERE email = ?',
                [email]
            );
            if (emailExisting.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: '同じメールアドレスが既に存在します',
                    error: 'DUPLICATE_ENTRY'
                });
            }
        }

        // パスワードハッシュ化
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // ユーザー作成
        const insertQuery = `
            INSERT INTO users (username, email, password_hash, role, is_active)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await connection.execute(insertQuery, [
            username,
            email || null,
            passwordHash,
            role,
            is_active
        ]);

        res.status(201).json({
            success: true,
            data: {
                id: result.insertId,
                username,
                email: email || null,
                role,
                is_active,
                created_by: req.user.username
            },
            message: 'ユーザーを作成しました'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザーの作成に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * ユーザー更新
 */
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { email, role, is_active } = req.body;

        // 自分自身の権限変更を防ぐ
        if (parseInt(id) === req.user.id && (role !== undefined || is_active !== undefined)) {
            return res.status(400).json({
                success: false,
                message: '自分自身の権限やアクティブ状態は変更できません'
            });
        }

        if (role && !['admin', 'production_manager', 'material_staff', 'viewer'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: '無効な権限レベルです'
            });
        }

        if (email && email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: '有効なメールアドレスを入力してください'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // ユーザー存在確認
        const [user] = await connection.execute(
            'SELECT id, username FROM users WHERE id = ?',
            [id]
        );
        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたユーザーが見つかりません'
            });
        }

        // メール重複チェック（変更される場合）
        if (email !== undefined && email !== '') {
            const [emailExisting] = await connection.execute(
                'SELECT email FROM users WHERE email = ? AND id != ?',
                [email, id]
            );
            if (emailExisting.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: '同じメールアドレスが既に存在します'
                });
            }
        }

        // 更新クエリ作成
        const updates = [];
        const params = [];

        if (email !== undefined) {
            updates.push('email = ?');
            params.push(email === '' ? null : email);
        }
        if (role !== undefined) {
            updates.push('role = ?');
            params.push(role);
        }
        if (is_active !== undefined) {
            updates.push('is_active = ?');
            params.push(is_active);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: '更新する項目がありません'
            });
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await connection.execute(updateQuery, params);

        res.json({
            success: true,
            message: 'ユーザー情報を更新しました'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザーの更新に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * ユーザー削除（論理削除）
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        // 自分自身の削除を防ぐ
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                success: false,
                message: '自分自身のアカウントは削除できません'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // ユーザー存在確認
        const [user] = await connection.execute(
            'SELECT id, username FROM users WHERE id = ?',
            [id]
        );
        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたユーザーが見つかりません'
            });
        }

        // 論理削除
        await connection.execute(
            'UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );

        res.json({
            success: true,
            message: 'ユーザーを削除しました'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザーの削除に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * パスワードリセット
 */
router.put('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { new_password } = req.body;

        if (!new_password || new_password.length < 8) {
            return res.status(400).json({
                success: false,
                message: '新しいパスワードは8文字以上である必要があります'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // ユーザー存在確認
        const [user] = await connection.execute(
            'SELECT id, username FROM users WHERE id = ?',
            [id]
        );
        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたユーザーが見つかりません'
            });
        }

        // パスワードハッシュ化
        const passwordHash = await bcrypt.hash(new_password, saltRounds);

        // パスワード更新
        await connection.execute(
            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [passwordHash, id]
        );

        res.json({
            success: true,
            message: 'パスワードをリセットしました',
            data: {
                user_id: parseInt(id),
                username: user[0].username,
                reset_by: req.user.username
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'パスワードのリセットに失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * ユーザー有効/無効切り替え
 */
router.put('/:id/toggle-active', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        // 自分自身の状態変更を防ぐ
        if (parseInt(id) === req.user.id) {
            return res.status(400).json({
                success: false,
                message: '自分自身のアクティブ状態は変更できません'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // ユーザー存在確認と現在の状態取得
        const [user] = await connection.execute(
            'SELECT id, username, is_active FROM users WHERE id = ?',
            [id]
        );
        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたユーザーが見つかりません'
            });
        }

        const newStatus = !user[0].is_active;

        // 状態切り替え
        await connection.execute(
            'UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [newStatus, id]
        );

        res.json({
            success: true,
            data: {
                user_id: parseInt(id),
                username: user[0].username,
                is_active: newStatus,
                updated_by: req.user.username
            },
            message: `ユーザーを${newStatus ? '有効化' : '無効化'}しました`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'ユーザー状態の切り替えに失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;