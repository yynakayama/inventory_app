-- =====================================================
-- 03_inventory.sql
-- 在庫管理関連テーブル作成
-- =====================================================

-- 在庫管理テーブル
CREATE TABLE inventory (
    part_code VARCHAR(30) PRIMARY KEY COMMENT '部品コード',
    current_stock INTEGER NOT NULL DEFAULT 0 COMMENT '現在在庫数',
    reserved_stock INTEGER NOT NULL DEFAULT 0 COMMENT '予約済み在庫数',
    safety_stock INTEGER NOT NULL DEFAULT 0 COMMENT '安全在庫数',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    FOREIGN KEY (part_code) REFERENCES parts(part_code),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='在庫管理テーブル - 部品別の在庫状況を管理';

-- 在庫トランザクションテーブル
CREATE TABLE inventory_transactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    part_code VARCHAR(30) NOT NULL COMMENT '部品コード',
    transaction_type ENUM('入荷', '出庫', '予約', '予約解除', '棚おろし修正', '初期在庫') NOT NULL COMMENT 'トランザクション種別',
    quantity INTEGER NOT NULL COMMENT '数量（プラス/マイナス）',
    before_stock INTEGER NOT NULL COMMENT '変更前在庫数',
    after_stock INTEGER NOT NULL COMMENT '変更後在庫数',
    reference_id BIGINT NULL COMMENT '参照元ID（生産計画ID、入荷ID等）',
    reference_type VARCHAR(50) NULL COMMENT '参照元種別',
    transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'トランザクション日時',
    remarks TEXT NULL COMMENT '備考',
    created_by VARCHAR(50) DEFAULT 'system' COMMENT '作成者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    FOREIGN KEY (part_code) REFERENCES parts(part_code),
    INDEX idx_part_code_date (part_code, transaction_date),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='在庫トランザクション履歴テーブル - 全ての在庫変動を記録';

-- 利用可能在庫計算用のVIEW（部品コードのみ設計対応）
-- 利用可能在庫 = 現在在庫 - 予約済み在庫
CREATE VIEW available_inventory AS
SELECT 
    i.part_code,
    COALESCE(LEFT(p.specification, 100), '仕様未登録') as specification_short,
    i.current_stock,
    i.reserved_stock,
    i.safety_stock,
    (i.current_stock - i.reserved_stock) AS available_stock,
    CASE
        WHEN (i.current_stock - i.reserved_stock) < i.safety_stock THEN 'LOW'
        WHEN (i.current_stock - i.reserved_stock) <= (i.safety_stock * 1.5) THEN 'WARNING'
        ELSE 'OK'
    END AS stock_status,
    i.updated_at
FROM inventory i
INNER JOIN parts p ON i.part_code = p.part_code
WHERE p.is_active = TRUE;

-- 既存の部品マスタに対応する在庫レコードを初期作成
-- 現在在庫0、予約在庫0で初期化
INSERT INTO inventory (part_code, current_stock, reserved_stock, safety_stock)
SELECT 
    part_code,
    0 as current_stock,
    0 as reserved_stock,
    safety_stock
FROM parts 
WHERE is_active = TRUE
AND part_code NOT IN (SELECT part_code FROM inventory);

-- 初期在庫設定用のトランザクション記録
INSERT INTO inventory_transactions (
    part_code, 
    transaction_type, 
    quantity, 
    before_stock, 
    after_stock, 
    remarks
)
SELECT 
    part_code,
    '初期在庫',
    0,
    0,
    0,
    '初期在庫レコード作成'
FROM parts 
WHERE is_active = TRUE;

-- サンプルデータ: 一部の部品に初期在庫を設定
UPDATE inventory SET current_stock = 100 WHERE part_code = 'SUS304-M6-20-HEX';
UPDATE inventory SET current_stock = 200 WHERE part_code = 'SUS304-M8-30-HEX';
UPDATE inventory SET current_stock = 50 WHERE part_code = 'LED-RED-5MM-20MA';
UPDATE inventory SET current_stock = 150 WHERE part_code = 'ABS-CASE-100X60X25';
UPDATE inventory SET current_stock = 80 WHERE part_code = 'RES-1K-1/4W-5PCT';

-- サンプルデータのトランザクション記録
INSERT INTO inventory_transactions (
    part_code, transaction_type, quantity, before_stock, after_stock, remarks
) VALUES
('SUS304-M6-20-HEX', '初期在庫', 100, 0, 100, 'サンプル初期在庫設定'),
('SUS304-M8-30-HEX', '初期在庫', 200, 0, 200, 'サンプル初期在庫設定'),
('LED-RED-5MM-20MA', '初期在庫', 50, 0, 50, 'サンプル初期在庫設定'),
('ABS-CASE-100X60X25', '初期在庫', 150, 0, 150, 'サンプル初期在庫設定'),
('RES-1K-1/4W-5PCT', '初期在庫', 80, 0, 80, 'サンプル初期在庫設定');

-- データ確認用クエリ
SELECT 
    '在庫管理テーブル作成完了' as status,
    (SELECT COUNT(*) FROM inventory) as inventory_records,
    (SELECT COUNT(*) FROM inventory_transactions) as transaction_records,
    NOW() as completed_time;

-- 在庫状況確認
SELECT 
    part_code,
    specification_short,
    current_stock,
    reserved_stock,
    available_stock,
    stock_status
FROM available_inventory 
ORDER BY part_code
LIMIT 10;

-- トランザクション履歴確認
SELECT 
    part_code,
    transaction_type,
    quantity,
    after_stock,
    transaction_date,
    remarks
FROM inventory_transactions 
ORDER BY transaction_date DESC 
LIMIT 10;