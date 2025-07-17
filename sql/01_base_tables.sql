-- ==========================================
-- 在庫管理システム - 基本テーブル作成SQL
-- ==========================================
-- 接続テスト、ユーザー管理等の基盤機能

-- 1. 接続テスト用テーブル
-- Docker環境での接続確認とデータベース初期化確認用
CREATE TABLE IF NOT EXISTS connection_test (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'ID',
    test_message VARCHAR(255) DEFAULT 'MySQL接続成功' COMMENT 'テストメッセージ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時'
) COMMENT='データベース接続テスト用テーブル';

-- 接続テスト用初期データ挿入
INSERT INTO connection_test (test_message) VALUES ('データベース初期化完了');

-- 2. ユーザー管理テーブル
-- システム利用者の認証・権限管理
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT 'ユーザーID',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT 'ユーザー名',
    email VARCHAR(100) NOT NULL UNIQUE COMMENT 'メールアドレス',
    password_hash VARCHAR(255) NOT NULL COMMENT 'パスワードハッシュ',
    role ENUM('admin', 'production_manager', 'material_staff', 'viewer') 
         DEFAULT 'viewer' COMMENT '権限レベル',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    last_login_at TIMESTAMP NULL COMMENT '最終ログイン日時',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- インデックス
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) COMMENT='ユーザー管理テーブル';

-- 開発用初期ユーザー追加
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@example.com', 'temp_password_hash', 'admin'),
('production_mgr', 'production@example.com', 'temp_password_hash', 'production_manager'),
('material_staff', 'material@example.com', 'temp_password_hash', 'material_staff'),
('viewer_user', 'viewer@example.com', 'temp_password_hash', 'viewer')
ON DUPLICATE KEY UPDATE
    email = VALUES(email),
    role = VALUES(role),
    updated_at = CURRENT_TIMESTAMP;

-- 3. システム設定テーブル（将来拡張用）
-- アプリケーションの各種設定値を管理
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY COMMENT '設定キー',
    setting_value TEXT NOT NULL COMMENT '設定値',
    setting_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string' COMMENT '設定値タイプ',
    description VARCHAR(255) NULL COMMENT '設定の説明',
    is_editable BOOLEAN DEFAULT TRUE COMMENT '編集可能フラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時'
) COMMENT='システム設定テーブル';

-- システム設定初期値
INSERT INTO system_settings (setting_key, setting_value, setting_type, description, is_editable) VALUES
('system_name', '在庫管理システム', 'string', 'システム名称', TRUE),
('version', '1.0.0', 'string', 'システムバージョン', FALSE),
('default_timezone', 'Asia/Tokyo', 'string', 'デフォルトタイムゾーン', TRUE),
('max_upload_size', '10485760', 'number', 'ファイルアップロード最大サイズ（バイト）', TRUE),
('enable_debug_mode', 'false', 'boolean', 'デバッグモード有効化', TRUE)
ON DUPLICATE KEY UPDATE
    setting_value = VALUES(setting_value),
    updated_at = CURRENT_TIMESTAMP;

-- 4. データ確認用クエリ（コメントアウト済み）
/*
-- 基本テーブル確認
SELECT 'connection_test' as table_name, COUNT(*) as record_count FROM connection_test
UNION ALL
SELECT 'users' as table_name, COUNT(*) as record_count FROM users
UNION ALL
SELECT 'system_settings' as table_name, COUNT(*) as record_count FROM system_settings;

-- ユーザー一覧確認
SELECT 
    id,
    username,
    email,
    role,
    is_active,
    created_at
FROM users 
ORDER BY role, username;

-- システム設定確認
SELECT 
    setting_key,
    setting_value,
    setting_type,
    description
FROM system_settings 
ORDER BY setting_key;
*/