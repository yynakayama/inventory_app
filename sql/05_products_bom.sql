-- ==========================================
-- 在庫管理システム - 工程ベースBOMテーブル作成SQL
-- ==========================================

-- 1. 製品マスタテーブル作成
CREATE TABLE IF NOT EXISTS products (
    product_code VARCHAR(20) PRIMARY KEY COMMENT '製品コード（例：V5000, D2000）',
    remarks TEXT NULL COMMENT '備考',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- インデックス作成
    INDEX idx_product_code (product_code),
    INDEX idx_active (is_active)
) COMMENT='製品マスタテーブル';

-- 2. 工程・作業場マスタテーブル作成
CREATE TABLE IF NOT EXISTS work_stations (
    station_code VARCHAR(20) PRIMARY KEY COMMENT '作業場コード（例：sub1-1, main1-1）',
    process_group VARCHAR(10) NOT NULL COMMENT '工程グループ（sub1, main1, test1等）',
    remarks TEXT NULL COMMENT '備考',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- インデックス作成
    INDEX idx_station_code (station_code),
    INDEX idx_process_group (process_group),
    INDEX idx_active (is_active)
) COMMENT='工程・作業場マスタテーブル';

-- 3. 工程ベースBOMテーブル作成
CREATE TABLE IF NOT EXISTS bom_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT 'BOM ID',
    product_code VARCHAR(20) NOT NULL COMMENT '製品コード',
    station_code VARCHAR(20) NOT NULL COMMENT '作業場コード',
    part_code VARCHAR(30) NOT NULL COMMENT '部品コード',
    quantity INT NOT NULL DEFAULT 1 COMMENT '使用数量',
    remarks TEXT NULL COMMENT '備考',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- 外部キー制約
    FOREIGN KEY (product_code) REFERENCES products(product_code) ON DELETE CASCADE,
    FOREIGN KEY (station_code) REFERENCES work_stations(station_code) ON DELETE CASCADE,
    FOREIGN KEY (part_code) REFERENCES parts(part_code) ON DELETE CASCADE,
    
    -- ユニーク制約（同一製品・同一工程・同一部品の重複を防ぐ）
    UNIQUE KEY uk_product_station_part (product_code, station_code, part_code),
    
    -- インデックス作成
    INDEX idx_product_code (product_code),
    INDEX idx_station_code (station_code),
    INDEX idx_part_code (part_code),
    INDEX idx_active (is_active)
) COMMENT='工程ベースBOMテーブル（製品×工程×部品の関係管理）';

-- 4. 初期データ投入 - 製品マスタ
INSERT INTO products (product_code, remarks) VALUES
('V5000', '主力製品・汎用型'),
('D2000', '高機能・産業用'),
('T1000', '検査・測定用')
ON DUPLICATE KEY UPDATE
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 5. 初期データ投入 - 工程・作業場マスタ
INSERT INTO work_stations (station_code, process_group, remarks) VALUES
-- sub1工程（サブアッセンブリ1）
('sub1-1', 'sub1', '電子基板組み立て作業場'),
('sub1-2', 'sub1', '配線・結線作業場'),
('sub1-3', 'sub1', '基板検査作業場'),

-- sub4工程（サブアッセンブリ4）
('sub4-1', 'sub4', '筐体加工作業場'),
('sub4-2', 'sub4', '筐体組み立て作業場'),

-- main1工程（メイン組み立て1）
('main1-1', 'main1', '主装置組み立て作業場'),
('main1-2', 'main1', '配管・配線作業場'),

-- main2工程（メイン組み立て2）
('main2-1', 'main2', '最終組み立て作業場'),

-- main3工程（メイン組み立て3）
('main3-1', 'main3', '調整・校正作業場'),

-- test工程（検査・テスト）
('test1-1', 'test1', '機能テスト作業場'),
('test1-2', 'test1', '最終検査作業場')
ON DUPLICATE KEY UPDATE
    process_group = VALUES(process_group),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 6. 初期データ投入 - 工程ベースBOM（製品V5000の例）
INSERT INTO bom_items (product_code, station_code, part_code, quantity, remarks) VALUES
-- V5000製品のBOM構成（5部品以下に簡素化）
-- sub1-1工程（電子基板組み立て）
('V5000', 'sub1-1', 'LED-RED-5MM-20MA', 2, '状態表示LED'),
('V5000', 'sub1-1', 'RES-1K-1/4W-5PCT', 4, '電流制限抵抗'),

-- sub4-2工程（筐体組み立て）
('V5000', 'sub4-2', 'ABS-CASE-150X90X35', 1, 'メイン筐体'),

-- main1-1工程（主装置組み立て）
('V5000', 'main1-1', 'MOTOR-NEMA17-17HS4401', 1, '駆動モーター'),

-- 最終工程（梱包）
('V5000', 'test1-2', 'CARDBOARD-BOX-250X180X120', 1, '製品梱包箱')

ON DUPLICATE KEY UPDATE
    quantity = VALUES(quantity),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 7. 初期データ投入 - 工程ベースBOM（製品D2000の例）
INSERT INTO bom_items (product_code, station_code, part_code, quantity, remarks) VALUES
-- D2000製品のBOM構成（5部品以下に簡素化、V5000と2部品共通）
-- sub1-1工程（電子基板組み立て）
('D2000', 'sub1-1', 'LED-BLUE-5MM-20MA', 3, 'データ表示LED'),
('D2000', 'sub1-1', 'RES-1K-1/4W-5PCT', 6, '入力抵抗（V5000と共通）'),

-- sub4-2工程（筐体組み立て）
('D2000', 'sub4-2', 'ABS-CASE-150X90X35', 1, 'メイン筐体（V5000と共通）'),

-- main1-1工程（主装置組み立て）
('D2000', 'main1-1', 'SENSOR-PT100-CLASSA', 2, 'データ収集用センサー'),

-- 最終工程（梱包）
('D2000', 'test1-2', 'BUBBLE-WRAP-300MM-4MM', 2, '厳重梱包用緩衝材')

ON DUPLICATE KEY UPDATE
    quantity = VALUES(quantity),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 8. 工程ベース所要量計算用VIEW作成
CREATE OR REPLACE VIEW bom_requirements AS
SELECT 
    b.product_code,
    b.station_code,
    ws.process_group,
    b.part_code,
    p.specification as part_specification,
    b.quantity as unit_quantity,
    b.remarks as bom_remarks,
    p.supplier,
    p.lead_time_days
FROM bom_items b
    INNER JOIN products pr ON b.product_code = pr.product_code
    INNER JOIN work_stations ws ON b.station_code = ws.station_code
    INNER JOIN parts p ON b.part_code = p.part_code
WHERE b.is_active = TRUE 
    AND pr.is_active = TRUE 
    AND ws.is_active = TRUE 
    AND p.is_active = TRUE
ORDER BY b.product_code, ws.process_group, b.station_code, b.part_code;

-- 9. データ確認用クエリ実行
SELECT 
    '工程ベースBOMテーブル作成完了' as status,
    (SELECT COUNT(*) FROM products) as products_count,
    (SELECT COUNT(*) FROM work_stations) as stations_count,
    (SELECT COUNT(*) FROM bom_items) as bom_items_count,
    NOW() as completed_time;