const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const mysql = require('mysql2/promise');
const { authenticateToken } = require('../middleware/auth');

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

// ログイン試行回数制限設定
const loginLimiter = rateLimit({
    windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW || '15') * 60 * 1000, // 15分
    max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5'), // 5回まで
    message: {
        success: false,
        message: 'ログイン試行回数が上限に達しました。しばらく待ってから再試行してください。',
        error: 'TOO_MANY_ATTEMPTS'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true // 成功した場合はカウントしない
});

/**
 * ログインAPI
 * POST /api/auth/login
 * ユーザー名・パスワードでログインし、JWTトークンを発行
 */
router.post('/login',
    loginLimiter,
    [
        body('username').notEmpty().trim().withMessage('ユーザー名は必須です'),
        body('password').isLength({ min: 4 }).withMessage('パスワードは4文字以上で入力してください')
    ],
    async (req, res) => {
        try {
            // バリデーション結果チェック
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: '入力値に誤りがあります',
                    errors: errors.array()
                });
            }

            const { username, password } = req.body;
            const connection = await mysql.createConnection(dbConfig);

            try {
                // ユーザー情報取得
                const [users] = await connection.execute(
                    'SELECT id, username, email, password_hash, role, is_active FROM users WHERE username = ?',
                    [username]
                );

                if (users.length === 0) {
                    return res.status(401).json({
                        success: false,
                        message: 'ユーザー名またはパスワードが正しくありません',
                        error: 'INVALID_CREDENTIALS'
                    });
                }

                const user = users[0];

                // アカウント有効性チェック
                if (!user.is_active) {
                    return res.status(401).json({
                        success: false,
                        message: 'このアカウントは無効化されています',
                        error: 'ACCOUNT_DISABLED'
                    });
                }

                // パスワード検証
                // 開発段階：temp_password_hashの場合は平文で比較
                let isPasswordValid = false;
                if (user.password_hash === 'temp_password_hash') {
                    // 開発用：デフォルトパスワードでログイン可能
                    const defaultPasswords = {
                        'admin': 'admin123',
                        'production_mgr': 'prod123',
                        'material_staff': 'material123',
                        'viewer_user': 'viewer123'
                    };
                    isPasswordValid = (password === defaultPasswords[username]);
                } else {
                    // 本来のbcrypt検証
                    isPasswordValid = await bcrypt.compare(password, user.password_hash);
                }

                if (!isPasswordValid) {
                    return res.status(401).json({
                        success: false,
                        message: 'ユーザー名またはパスワードが正しくありません',
                        error: 'INVALID_CREDENTIALS'
                    });
                }

                // JWTトークン生成
                const tokenPayload = {
                    userId: user.id,
                    username: user.username,
                    role: user.role
                };

                const accessToken = jwt.sign(
                    tokenPayload,
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
                );

                // リフレッシュトークン生成（将来的に使用）
                const refreshToken = jwt.sign(
                    { userId: user.id },
                    process.env.JWT_SECRET,
                    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
                );

                // 最終ログイン時刻更新
                await connection.execute(
                    'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [user.id]
                );

                // 成功レスポンス
                res.json({
                    success: true,
                    message: 'ログインに成功しました',
                    data: {
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            role: user.role
                        },
                        tokens: {
                            accessToken: accessToken,
                            refreshToken: refreshToken,
                            expiresIn: process.env.JWT_EXPIRES_IN || '24h'
                        }
                    }
                });

            } finally {
                await connection.end();
            }

        } catch (error) {
            console.error('ログインエラー:', error);
            res.status(500).json({
                success: false,
                message: 'ログイン処理中にエラーが発生しました',
                error: 'LOGIN_ERROR'
            });
        }
    }
);

/**
 * ログアウトAPI
 * POST /api/auth/logout
 * 現在のところクライアント側でトークンを削除するだけ
 * 将来的にはトークンブラックリスト機能を実装予定
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // 現在はクライアント側でトークン削除を指示するのみ
        // 将来的にはRedisなどでトークンブラックリストを管理
        
        res.json({
            success: true,
            message: 'ログアウトしました。クライアント側でトークンを削除してください。'
        });

    } catch (error) {
        console.error('ログアウトエラー:', error);
        res.status(500).json({
            success: false,
            message: 'ログアウト処理中にエラーが発生しました'
        });
    }
});

/**
 * ユーザー情報取得API
 * GET /api/auth/me
 * 現在ログイン中のユーザー情報を取得
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const connection = await mysql.createConnection(dbConfig);

        try {
            // 最新のユーザー情報を取得
            const [users] = await connection.execute(
                'SELECT id, username, email, role, is_active, last_login_at, created_at FROM users WHERE id = ?',
                [req.user.id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'ユーザーが見つかりません'
                });
            }

            const user = users[0];

            res.json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        isActive: user.is_active,
                        lastLoginAt: user.last_login_at,
                        createdAt: user.created_at
                    }
                }
            });

        } finally {
            await connection.end();
        }

    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        res.status(500).json({
            success: false,
            message: 'ユーザー情報の取得に失敗しました'
        });
    }
});

/**
 * パスワード変更API
 * PUT /api/auth/change-password
 * 認証済みユーザーのパスワードを変更
 */
router.put('/change-password',
    authenticateToken,
    [
        body('currentPassword').notEmpty().withMessage('現在のパスワードは必須です'),
        body('newPassword').isLength({ min: 8 }).withMessage('新しいパスワードは8文字以上で入力してください'),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('確認パスワードが一致しません');
            }
            return true;
        })
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: '入力値に誤りがあります',
                    errors: errors.array()
                });
            }

            const { currentPassword, newPassword } = req.body;
            const connection = await mysql.createConnection(dbConfig);

            try {
                // 現在のパスワードハッシュ取得
                const [users] = await connection.execute(
                    'SELECT password_hash FROM users WHERE id = ?',
                    [req.user.id]
                );

                if (users.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'ユーザーが見つかりません'
                    });
                }

                // 現在のパスワード検証
                const isCurrentPasswordValid = await bcrypt.compare(currentPassword, users[0].password_hash);
                if (!isCurrentPasswordValid) {
                    return res.status(400).json({
                        success: false,
                        message: '現在のパスワードが正しくありません'
                    });
                }

                // 新しいパスワードをハッシュ化
                const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
                const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

                // パスワード更新
                await connection.execute(
                    'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [newPasswordHash, req.user.id]
                );

                res.json({
                    success: true,
                    message: 'パスワードを変更しました'
                });

            } finally {
                await connection.end();
            }

        } catch (error) {
            console.error('パスワード変更エラー:', error);
            res.status(500).json({
                success: false,
                message: 'パスワード変更処理中にエラーが発生しました'
            });
        }
    }
);

module.exports = router;