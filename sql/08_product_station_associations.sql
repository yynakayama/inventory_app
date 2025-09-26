-- ==========================================
-- 製品-工程関連付けテーブル作成SQL
-- ==========================================

-- 製品-工程関連付けテーブル作成
CREATE TABLE IF NOT EXISTS product_station_associations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '関連付けID',
    product_code VARCHAR(20) NOT NULL COMMENT '製品コード',
    station_code VARCHAR(20) NOT NULL COMMENT '工程コード',
    sequence_number INT DEFAULT 0 COMMENT '工程順序',
    remarks TEXT NULL COMMENT '備考',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',

    -- 外部キー制約
    FOREIGN KEY (product_code) REFERENCES products(product_code) ON DELETE CASCADE,
    FOREIGN KEY (station_code) REFERENCES work_stations(station_code) ON DELETE CASCADE,

    -- ユニーク制約（同一製品・同一工程の重複を防ぐ）
    UNIQUE KEY uk_product_station (product_code, station_code),

    -- インデックス作成
    INDEX idx_product_code (product_code),
    INDEX idx_station_code (station_code),
    INDEX idx_active (is_active),
    INDEX idx_sequence (sequence_number)
) COMMENT='製品-工程関連付けテーブル';

-- 既存のBOMデータから製品-工程関連付けを生成
INSERT INTO product_station_associations (product_code, station_code, sequence_number, remarks)
SELECT DISTINCT
    product_code,
    station_code,
    0 as sequence_number,
    '既存BOMから自動生成' as remarks
FROM bom_items
WHERE is_active = TRUE
ON DUPLICATE KEY UPDATE
    updated_at = CURRENT_TIMESTAMP;

-- データ確認用クエリ実行
SELECT
    '製品-工程関連付けテーブル作成完了' as status,
    (SELECT COUNT(*) FROM product_station_associations) as associations_count,
    NOW() as completed_time;