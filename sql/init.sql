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

-- 部品マスタテーブル（第1段階用）
CREATE TABLE IF NOT EXISTS parts (
    part_code VARCHAR(50) PRIMARY KEY comment '部品コード',
    part_name VARCHAR(100) NOT NULL comment '部品名',
    specification VARCHAR(200) comment '規格・仕様',
    unit VARCHAR(20) DEFAULT '個' comment '単位',
    lead_time_days INT DEFAULT 0 comment 'リードタイム（日数）',
    safety_stock INT DEFAULT 0 comment '安全在庫数',
    supplier VARCHAR(100) comment '仕入先',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP comment '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP comment '更新日時'
)comment '部品マスタテーブル';

-- 初期部品データ挿入
INSERT INTO parts (part_code, part_name, specification, unit, lead_time_days, safety_stock, supplier) 
VALUES 
    ('M6-20-SUS', 'ボルト M6×20', 'ステンレス（SUS304）', '個', 7, 100, '東京ボルト株式会社'),
    ('M8-25-S45C', 'ボルト M8×25', '炭素鋼（S45C）', '個', 5, 50, '東京ボルト株式会社'),
    ('WASHER-M6', 'ワッシャー M6用', '亜鉛メッキ', '個', 3, 200, '関東部品商事'),
    ('GASKET-100', 'ガスケット φ100', 'NBR（ニトリルゴム）', '個', 14, 20, '大阪シール工業'),
    ('SPRING-A001', 'バネ A001', '線径2.0mm 自由長50mm', '個', 10, 30, '京都バネ製作所')
on duplicate key update 
    part_name = values(part_name), 
    specification = values(specification), 
    unit = values(unit), 
    lead_time_days = values(lead_time_days), 
    safety_stock = values(safety_stock), 
    supplier = values(supplier);

-- 部品マスタ用インデックス作成
CREATE INDEX idx_part_code ON parts (part_code);
create index idx_part_name on parts (part_name);
create index idx_supplier on parts (supplier);
create index idx_created_at on parts (update_at);