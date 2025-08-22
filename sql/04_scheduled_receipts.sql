-- 予定入荷管理テーブル作成スクリプト
-- 発注から入荷までの一連の流れを管理

CREATE TABLE scheduled_receipts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    
    -- 発注情報
    order_no VARCHAR(20) NOT NULL UNIQUE,           -- 発注番号（自動採番: PO240720001）
    part_code VARCHAR(30) NOT NULL,                 -- 部品コード（外部キー）
    supplier VARCHAR(100) NOT NULL,                 -- 仕入先（parts.supplierから取得）
    
    -- 数量情報
    order_quantity INTEGER NOT NULL,                -- 発注数量
    scheduled_quantity INTEGER NULL,                -- 予定入荷数量（納期回答時に設定）
    
    -- 日付情報
    order_date DATE NOT NULL,                       -- 発注日
    scheduled_date DATE NULL,                       -- 予定入荷日（納期回答時に設定）
    
    -- ステータス管理
    status ENUM(
        '納期回答待ち',   -- 発注登録直後
        '入荷予定',       -- 納期回答済み
        '入荷済み',       -- 入荷処理完了
        'キャンセル'      -- 発注キャンセル
    ) NOT NULL DEFAULT '納期回答待ち',
    
    -- その他情報
    remarks TEXT NULL,                              -- 備考
    created_by VARCHAR(50) DEFAULT 'system',       -- 作成者
    
    -- タイムスタンプ
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    -- 外部キー制約
    FOREIGN KEY (part_code) REFERENCES parts(part_code) ON DELETE RESTRICT,
    
    -- インデックス
    INDEX idx_part_code (part_code),
    INDEX idx_status (status),
    INDEX idx_scheduled_date (scheduled_date),
    INDEX idx_order_date (order_date)
);

-- 発注番号自動採番用のトリガー作成
-- PO + YYMMDD + 3桁連番 形式（例: PO24072001）
DELIMITER //

CREATE TRIGGER tr_scheduled_receipts_order_no 
BEFORE INSERT ON scheduled_receipts
FOR EACH ROW
BEGIN
    DECLARE today_str VARCHAR(6);
    DECLARE next_seq INT;
    DECLARE new_order_no VARCHAR(20);
    
    -- 今日の日付を YYMMDD 形式で取得
    SET today_str = DATE_FORMAT(CURDATE(), '%y%m%d');
    
    -- 今日の発注番号の最大連番を取得（存在しない場合は0）
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(order_no, 9) AS UNSIGNED)
    ), 0) + 1 INTO next_seq
    FROM scheduled_receipts 
    WHERE order_no LIKE CONCAT('PO', today_str, '%');
    
    -- 新しい発注番号を生成（3桁ゼロパディング）
    SET new_order_no = CONCAT('PO', today_str, LPAD(next_seq, 3, '0'));
    
    -- order_noが空の場合のみ自動設定
    IF NEW.order_no IS NULL OR NEW.order_no = '' THEN
        SET NEW.order_no = new_order_no;
    END IF;
END//

DELIMITER ;

-- 初期データ投入（テスト用）
-- 発注登録例：ステータス「納期回答待ち」
INSERT INTO scheduled_receipts (
    part_code, 
    supplier, 
    order_quantity, 
    order_date, 
    remarks
) VALUES 
-- SUSボルトの発注（納期回答待ち）
('SUS304-M6-20-HEX', 'ボルト商事株式会社', 500, '2024-07-15', '緊急発注'),

-- 樹脂部品の発注（納期回答済み）
('LED-WHITE-5MM', '東京電子商事', 200, '2024-07-10', '定期発注');

-- 納期回答例：予定数量・予定日を更新してステータス変更
UPDATE scheduled_receipts 
SET 
    scheduled_quantity = 180,  -- 発注数量200から減少
    scheduled_date = '2024-07-22',
    status = '入荷予定',
    updated_at = CURRENT_TIMESTAMP
WHERE part_code = 'LED-WHITE-5MM' 
  AND status = '納期回答待ち';

-- 確認用クエリ
SELECT 
    sr.order_no,
    sr.part_code,
    p.specification,
    sr.supplier,
    sr.order_quantity,
    sr.scheduled_quantity,
    sr.order_date,
    sr.scheduled_date,
    sr.status,
    sr.remarks
FROM scheduled_receipts sr
JOIN parts p ON sr.part_code = p.part_code
ORDER BY sr.created_at DESC;

-- このテーブルの主な機能
-- 1. 発注登録時：order_no自動採番、ステータス「納期回答待ち」
-- 2. 納期回答時：scheduled_quantity、scheduled_date更新、ステータス「入荷予定」
-- 3. 入荷処理時：receipts テーブルとの連携でステータス「入荷済み」
-- 4. キャンセル時：ステータス「キャンセル」に変更