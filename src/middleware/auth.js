const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

// データベース接続設定
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'inventory_db',
    charset: 'utf8mb4'
};

/**
 * JWT認証ミドルウェア
 * リクエストヘッダーからJWTトークンを検証し、ユーザー情報をreq.userに設定
 */
const authenticateToken = async (req, res, next) => {
    try {
        // Authorization ヘッダーからトークンを取得
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" の形式

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'アクセストークンが必要です',
                error: 'NO_TOKEN'
            });
        }

        // JWT トークンを検証
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // データベースからユーザー情報を取得（トークンが有効でも削除されたユーザーかチェック）
        const connection = await mysql.createConnection(dbConfig);
        
        const [users] = await connection.execute(
            'SELECT id, username, email, role, is_active, last_login_at FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );
        
        await connection.end();

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'ユーザーが見つからないか、無効化されています',
                error: 'USER_NOT_FOUND'
            });
        }

        // リクエストオブジェクトにユーザー情報を設定
        req.user = {
            id: users[0].id,
            username: users[0].username,
            email: users[0].email,
            role: users[0].role,
            lastLoginAt: users[0].last_login_at
        };

        next();

    } catch (error) {
        console.error('JWT認証エラー:', error);

        // JWT固有のエラーハンドリング
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'トークンの有効期限が切れています',
                error: 'TOKEN_EXPIRED'
            });
        }

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: '無効なトークンです',
                error: 'INVALID_TOKEN'
            });
        }

        // その他のエラー（DB接続エラーなど）
        return res.status(500).json({
            success: false,
            message: '認証処理中にエラーが発生しました',
            error: 'AUTH_ERROR'
        });
    }
};

/**
 * ロールベースアクセス制御ミドルウェア
 * 指定された権限を持つユーザーのみアクセスを許可
 * @param {string|string[]} allowedRoles - 許可する権限（文字列または配列）
 */
const requireRole = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: '認証が必要です',
                error: 'NOT_AUTHENTICATED'
            });
        }

        // 文字列の場合は配列に変換
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'この操作を実行する権限がありません',
                error: 'INSUFFICIENT_PERMISSION',
                requiredRole: roles,
                userRole: req.user.role
            });
        }

        next();
    };
};

/**
 * 管理者権限チェック（admin のみ）
 */
const requireAdmin = requireRole('admin');

/**
 * 生産管理権限チェック（admin, production_manager）
 */
const requireProductionAccess = requireRole(['admin', 'production_manager']);

/**
 * 資材管理権限チェック（admin, material_staff）
 */
const requireMaterialAccess = requireRole(['admin', 'material_staff']);

/**
 * 読み取り権限チェック（全ユーザー - 認証済みであればOK）
 */
const requireReadAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: '認証が必要です',
            error: 'NOT_AUTHENTICATED'
        });
    }
    next();
};

/**
 * オプション認証ミドルウェア
 * トークンがあれば検証するが、なくても処理を続行
 * パブリックAPIで使用者情報があると便利な場合に使用
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            req.user = null;
            return next();
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const connection = await mysql.createConnection(dbConfig);
        const [users] = await connection.execute(
            'SELECT id, username, email, role, is_active FROM users WHERE id = ? AND is_active = TRUE',
            [decoded.userId]
        );
        await connection.end();

        req.user = users.length > 0 ? {
            id: users[0].id,
            username: users[0].username,
            email: users[0].email,
            role: users[0].role
        } : null;

        next();

    } catch (error) {
        // エラーがあってもnullにして処理続行
        req.user = null;
        next();
    }
};

module.exports = {
    authenticateToken,
    requireRole,
    requireAdmin,
    requireProductionAccess,
    requireMaterialAccess,
    requireReadAccess,
    optionalAuth
};