-- ==========================================
-- 在庫管理システム - 棚おろし管理テーブル作成SQL
-- ファイル: 07_stocktaking.sql
-- ==========================================

-- 1. 棚おろし管理テーブル作成
CREATE TABLE IF NOT EXISTS stocktaking (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '棚おろしID',
    stocktaking_date DATE NOT NULL COMMENT '棚おろし実施日',
    part_code VARCHAR(30) NOT NULL COMMENT '部品コード',
    book_quantity INTEGER NOT NULL COMMENT '帳簿在庫数',
    actual_quantity INTEGER NOT NULL COMMENT '実地在庫数',
    difference INTEGER NOT NULL COMMENT '差異（実地-帳簿）',
    reason_code VARCHAR(20) NULL COMMENT '差異理由コード',
    remarks TEXT NULL COMMENT '備考',
    created_by VARCHAR(50) DEFAULT 'system' COMMENT '作成者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- 外部キー制約
    FOREIGN KEY (part_code) REFERENCES parts(part_code) ON DELETE RESTRICT,
    
    -- インデックス作成
    INDEX idx_stocktaking_date (stocktaking_date),
    INDEX idx_part_code (part_code),
    INDEX idx_stocktaking_date_part (stocktaking_date, part_code),
    INDEX idx_difference (difference),
    INDEX idx_reason_code (reason_code),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='棚おろし実施記録テーブル';

-- 2. 棚おろし履歴詳細VIEW作成
CREATE OR REPLACE VIEW stocktaking_history_detail AS
SELECT 
    s.id,
    s.stocktaking_date,
    s.part_code,
    p.specification as part_specification,
    p.category as part_category,
    p.supplier,
    s.book_quantity,
    s.actual_quantity,
    s.difference,
    s.reason_code,
    s.remarks,
    s.created_by,
    s.created_at,
    -- 差異の分類
    CASE 
        WHEN s.difference > 0 THEN '増加'
        WHEN s.difference < 0 THEN '減少'
        ELSE '差異なし'
    END as difference_type,
    -- 差異率の計算
    CASE 
        WHEN s.book_quantity > 0 THEN ROUND((s.difference / s.book_quantity) * 100, 2)
        ELSE NULL
    END as difference_percentage,
    -- 金額インパクト（概算）
    ROUND(ABS(s.difference) * COALESCE(p.unit_price, 0), 2) as amount_impact
FROM stocktaking s
    INNER JOIN parts p ON s.part_code = p.part_code
ORDER BY s.stocktaking_date DESC, s.part_code;

-- 3. 差異サマリーVIEW作成
CREATE OR REPLACE VIEW stocktaking_difference_summary AS
SELECT 
    DATE(s.stocktaking_date) as stocktaking_date,
    COUNT(*) as total_parts_count,
    COUNT(CASE WHEN s.difference != 0 THEN 1 END) as difference_parts_count,
    COUNT(CASE WHEN s.difference > 0 THEN 1 END) as increase_parts_count,
    COUNT(CASE WHEN s.difference < 0 THEN 1 END) as decrease_parts_count,
    SUM(ABS(s.difference)) as total_difference_quantity,
    ROUND(
        COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*), 
        2
    ) as difference_ratio_percentage,
    -- 理由別集計
    COUNT(CASE WHEN s.reason_code = '盗難' THEN 1 END) as theft_count,
    COUNT(CASE WHEN s.reason_code = '破損' THEN 1 END) as damage_count,
    COUNT(CASE WHEN s.reason_code = '計数ミス' THEN 1 END) as miscount_count,
    COUNT(CASE WHEN s.reason_code = 'その他' THEN 1 END) as other_count
FROM stocktaking s
GROUP BY DATE(s.stocktaking_date)
ORDER BY stocktaking_date DESC;

-- 4. 部品別棚おろし履歴VIEW作成
CREATE OR REPLACE VIEW stocktaking_part_history AS
SELECT 
    s.part_code,
    p.specification as part_specification,
    p.category as part_category,
    COUNT(*) as stocktaking_count,
    COUNT(CASE WHEN s.difference != 0 THEN 1 END) as difference_count,
    AVG(ABS(s.difference)) as avg_difference,
    MAX(ABS(s.difference)) as max_difference,
    MAX(s.stocktaking_date) as last_stocktaking_date,
    -- 最新の在庫状況
    (SELECT current_stock FROM inventory i WHERE i.part_code = s.part_code) as current_stock,
    -- 差異傾向の分析
    CASE 
        WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 50 THEN '高頻度差異'
        WHEN COUNT(CASE WHEN s.difference != 0 THEN 1 END) * 100.0 / COUNT(*) > 20 THEN '中頻度差異'
        ELSE '低頻度差異'
    END as difference_tendency
FROM stocktaking s
    INNER JOIN parts p ON s.part_code = p.part_code
GROUP BY s.part_code, p.specification, p.category
ORDER BY difference_count DESC, avg_difference DESC;

-- 5. 初期テストデータ投入（差異理由の確認用）
INSERT INTO stocktaking (
    stocktaking_date, part_code, book_quantity, actual_quantity, 
    difference, reason_code, remarks, created_by
) VALUES
-- 計数ミスのテストケース
('2025-07-20', 'SUS304-M6-20-HEX', 100, 98, -2, '計数ミス', '初期テストデータ - 微小差異', 'test_user'),
('2025-07-20', 'LED-RED-5MM-20MA', 200, 205, 5, '計数ミス', '初期テストデータ - 微小差異', 'test_user'),

-- 破損のテストケース
('2025-07-21', 'ABS-CASE-100X60X25', 50, 45, -5, '破損', '初期テストデータ - 破損による減少', 'test_user'),

-- 盗難のテストケース
('2025-07-22', 'BEARING-608ZZ-8X22X7', 30, 25, -5, '盗難', '初期テストデータ - 紛失', 'test_user'),

-- その他のテストケース
('2025-07-23', 'RES-1K-1/4W-5PCT', 500, 520, 20, 'その他', '初期テストデータ - 原因不明の増加', 'test_user')

ON DUPLICATE KEY UPDATE
    book_quantity = VALUES(book_quantity),
    actual_quantity = VALUES(actual_quantity),
    difference = VALUES(difference),
    reason_code = VALUES(reason_code),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 6. テストデータに基づく在庫数量の更新
-- 注意: 実際の運用では、APIを通じて自動的に更新されます
UPDATE inventory SET 
    current_stock = (
        SELECT s.actual_quantity 
        FROM stocktaking s 
        WHERE s.part_code = inventory.part_code 
        AND s.stocktaking_date = (
            SELECT MAX(stocktaking_date) 
            FROM stocktaking s2 
            WHERE s2.part_code = inventory.part_code
        )
        LIMIT 1
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE part_code IN (
    SELECT DISTINCT part_code FROM stocktaking
);

-- 7. 在庫トランザクション履歴にテストデータを追加
INSERT INTO inventory_transactions (
    part_code, transaction_type, quantity, before_stock, after_stock,
    reference_id, reference_type, transaction_date, remarks, created_by
)
SELECT 
    s.part_code,
    '棚おろし修正',
    s.difference,
    s.book_quantity,
    s.actual_quantity,
    s.id,
    'stocktaking',
    s.stocktaking_date,
    CONCAT('棚おろしによる在庫修正 - 理由: ', COALESCE(s.reason_code, '未指定')),
    s.created_by
FROM stocktaking s
WHERE s.difference != 0
ON DUPLICATE KEY UPDATE
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 8. データ確認用クエリ実行
SELECT 
    '棚おろし管理テーブル作成完了' as status,
    (SELECT COUNT(*) FROM stocktaking) as stocktaking_records_count,
    (SELECT COUNT(*) FROM stocktaking WHERE difference != 0) as difference_records_count,
    (SELECT COUNT(*) FROM inventory_transactions WHERE transaction_type = '棚おろし修正') as stocktaking_transactions_count,
    NOW() as completed_time;

-- 9. VIEW動作確認用クエリ
SELECT 'VIEW動作確認' as check_type;

-- 棚おろし履歴詳細VIEW確認
SELECT 
    part_code,
    stocktaking_date,
    book_quantity,
    actual_quantity,
    difference,
    difference_type,
    difference_percentage,
    reason_code
FROM stocktaking_history_detail
ORDER BY stocktaking_date DESC
LIMIT 5;

-- 差異サマリーVIEW確認
SELECT 
    stocktaking_date,
    total_parts_count,
    difference_parts_count,
    difference_ratio_percentage,
    theft_count,
    damage_count,
    miscount_count,
    other_count
FROM stocktaking_difference_summary
ORDER BY stocktaking_date DESC;

-- 部品別棚おろし履歴VIEW確認
SELECT 
    part_code,
    part_specification,
    stocktaking_count,
    difference_count,
    avg_difference,
    difference_tendency,
    current_stock
FROM stocktaking_part_history
WHERE difference_count > 0
ORDER BY difference_count DESC
LIMIT 5;

-- 10. テーブル構造確認
DESCRIBE stocktaking;