-- データベースの文字セット設定
ALTER DATABASE inventory_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 接続テスト用テーブル
CREATE TABLE IF NOT EXISTS connection_test (
    id INT AUTO_INCREMENT PRIMARY KEY,
    test_message VARCHAR(255) DEFAULT 'MySQL接続成功',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 初期データ挿入
INSERT INTO connection_test (test_message) VALUES ('データベース初期化完了');

-- 基本的なユーザーテーブル（第1段階用）
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'production_manager', 'material_staff', 'viewer') DEFAULT 'viewer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 初期ユーザー追加（開発用）
INSERT INTO users (username, email, password_hash, role) VALUES 
('admin', 'admin@example.com', 'temp_password_hash', 'admin'),
('test_user', 'test@example.com', 'temp_password_hash', 'viewer');