-- ==========================================
-- 在庫管理システム - 部品マスタテーブル作成SQL
-- ==========================================

-- 1. 部品マスタテーブル作成
CREATE TABLE IF NOT EXISTS parts (
    part_code VARCHAR(30) PRIMARY KEY COMMENT '部品コード（例：SUS304-M6-20-HEX）',
    specification VARCHAR(300) NULL COMMENT '規格・仕様（部品の詳細説明）',
    unit VARCHAR(10) DEFAULT '個' COMMENT '単位（個、kg、m等）',
    lead_time_days INT DEFAULT 7 NOT NULL COMMENT '調達リードタイム（日数）',
    safety_stock INT DEFAULT 0 COMMENT '安全在庫数',
    supplier VARCHAR(100) NULL COMMENT '主要仕入先',
    category VARCHAR(50) NULL COMMENT '部品カテゴリ（機械部品、電子部品等）',
    unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '単価（円）',
    remarks TEXT NULL COMMENT '備考',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ（廃番管理用）',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- インデックス作成（検索性能向上のため）
    INDEX idx_part_code (part_code),
    INDEX idx_specification (specification(100)),  -- 部分インデックス
    INDEX idx_category (category),
    INDEX idx_supplier (supplier),
    INDEX idx_active (is_active),
    INDEX idx_lead_time (lead_time_days)
) COMMENT='部品マスタテーブル - 部品コードのみ設計';

-- 2. 部品カテゴリマスタテーブル（将来の拡張用）
CREATE TABLE IF NOT EXISTS part_categories (
    category_code VARCHAR(20) PRIMARY KEY COMMENT 'カテゴリコード',
    category_name VARCHAR(50) NOT NULL COMMENT 'カテゴリ名',
    parent_category VARCHAR(20) NULL COMMENT '親カテゴリコード',
    sort_order INT DEFAULT 0 COMMENT '表示順序',
    is_active BOOLEAN DEFAULT TRUE COMMENT 'アクティブフラグ',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    
    -- 外部キー制約
    FOREIGN KEY (parent_category) REFERENCES part_categories(category_code)
) COMMENT='部品カテゴリマスタ';

-- 3. 初期データ投入 - 部品カテゴリ
INSERT INTO part_categories (category_code, category_name, sort_order) VALUES
('MECH', '機械部品', 1),
('ELEC', '電子部品', 2),
('RESIN', '樹脂部品', 3),
('METAL', '金属加工品', 4),
('PACK', '包装材料', 5)
ON DUPLICATE KEY UPDATE
    category_name = VALUES(category_name),
    sort_order = VALUES(sort_order);

-- 4. 初期データ投入 - 部品マスタ（体系的な部品コード）
INSERT INTO parts (
    part_code, specification, unit, lead_time_days, 
    safety_stock, supplier, category, unit_price, remarks
) VALUES
-- 機械部品（材質-サイズ-長さ-種類の体系）
('SUS304-M6-20-HEX', 'ステンレスボルト SUS304 M6×20 六角頭 JIS B1180', '個', 14, 100, '関西ボルト工業', 'MECH', 15.50, '一般締結用'),
('SUS304-M6-25-HEX', 'ステンレスボルト SUS304 M6×25 六角頭 JIS B1180', '個', 14, 50, '関西ボルト工業', 'MECH', 18.00, '一般締結用'),
('SUS304-M8-30-HEX', 'ステンレスボルト SUS304 M8×30 六角頭 JIS B1180', '個', 14, 80, '関西ボルト工業', 'MECH', 25.00, '重要締結用'),
('SUS304-M6-NUT', 'ステンレスナット SUS304 M6 六角 JIS B1181', '個', 14, 200, '関西ボルト工業', 'MECH', 8.50, 'M6ボルト用'),
('SUS304-M8-NUT', 'ステンレスナット SUS304 M8 六角 JIS B1181', '個', 14, 150, '関西ボルト工業', 'MECH', 12.00, 'M8ボルト用'),
('SUS304-M6-WASHER', 'ステンレスワッシャー SUS304 M6 平ワッシャー JIS B1256', '個', 14, 300, '関西ボルト工業', 'MECH', 5.00, '座面保護用'),

-- 電子部品（種類-色-サイズ-仕様の体系）
('LED-RED-5MM-20MA', '赤色LED 5mm 順方向電圧2.1V 20mA 一般表示用', '個', 21, 500, '東京電子商事', 'ELEC', 35.00, '表示灯用'),
('LED-GREEN-5MM-20MA', '緑色LED 5mm 順方向電圧2.2V 20mA 正常表示用', '個', 21, 500, '東京電子商事', 'ELEC', 35.00, '表示灯用'),
('LED-BLUE-5MM-20MA', '青色LED 5mm 順方向電圧3.2V 20mA 情報表示用', '個', 21, 300, '東京電子商事', 'ELEC', 45.00, '表示灯用'),
('RES-1K-1/4W-5PCT', '炭素皮膜抵抗 1kΩ 1/4W ±5% 一般用途', '個', 21, 1000, '東京電子商事', 'ELEC', 8.00, '一般用途'),
('RES-10K-1/4W-5PCT', '炭素皮膜抵抗 10kΩ 1/4W ±5% 一般用途', '個', 21, 800, '東京電子商事', 'ELEC', 8.00, '一般用途'),
('CAP-ELEC-100UF-25V', 'アルミ電解コンデンサ 100μF 25V 電源回路用', '個', 21, 200, '東京電子商事', 'ELEC', 25.00, '電源回路用'),

-- 樹脂部品（材質-用途-サイズの体系）
('ABS-CASE-100X60X25', 'ABSケース 100×60×25mm 難燃性UL94-V0 小型機器筐体', '個', 28, 50, '大阪プラスチック', 'RESIN', 180.00, '電子機器筐体'),
('ABS-CASE-150X90X35', 'ABSケース 150×90×35mm 難燃性UL94-V0 中型機器筐体', '個', 28, 30, '大阪プラスチック', 'RESIN', 280.00, '電子機器筐体'),
('POM-BTN-BLACK-12MM', 'ポリアセタール押しボタン 黒 φ12mm 操作用', '個', 21, 100, '京都樹脂工業', 'RESIN', 95.00, '操作用ボタン'),
('POM-BTN-RED-12MM', 'ポリアセタール押しボタン 赤 φ12mm 非常停止用', '個', 21, 80, '京都樹脂工業', 'RESIN', 95.00, '非常停止用'),

-- 金属加工品（材質-形状-サイズの体系）
('AL5052-PLATE-100X100X3', 'アルミプレート A5052 100×100×3mm アルマイト処理 基板用', '個', 35, 20, '神戸金属加工', 'METAL', 450.00, '基板用プレート'),
('AL5052-PLATE-150X150X3', 'アルミプレート A5052 150×150×3mm アルマイト処理 基板用', '個', 35, 15, '神戸金属加工', 'METAL', 680.00, '基板用プレート'),
('SPCC-BRACKET-L50X50X3', 'L型ブラケット SPCC 50×50×3mm 亜鉛メッキ 取付金具', '個', 28, 30, '神戸金属加工', 'METAL', 120.00, '取付用金具'),
('SUS304-SHAFT-6X100', 'ステンレス軸 SUS304 φ6×100mm 研磨仕上げ 回転軸用', '個', 42, 10, '精密シャフト工業', 'METAL', 380.00, '回転軸用'),

-- 包装材料（材質-用途-サイズの体系）
('CARDBOARD-BOX-180X120X80', 'ダンボール箱 3層構造 180×120×80mm 小物梱包用', '個', 7, 200, '梱包資材センター', 'PACK', 45.00, '製品梱包用'),
('CARDBOARD-BOX-250X180X120', 'ダンボール箱 3層構造 250×180×120mm 製品梱包用', '個', 7, 150, '梱包資材センター', 'PACK', 68.00, '製品梱包用'),
('BUBBLE-WRAP-300MM-4MM', 'エアキャップ 3層構造 300mm幅 厚み4mm 緩衝材', 'm', 7, 100, '梱包資材センター', 'PACK', 85.00, '緩衝材'),
('OPP-TAPE-50MM-100M', 'OPPテープ透明 50mm×100m ダンボール封緘用', '個', 7, 50, '梱包資材センター', 'PACK', 180.00, 'ダンボール封緘用'),

-- 特殊部品・高価格帯（メーカー型番ベース）
('MOTOR-NEMA17-17HS4401', 'ステッピングモータ NEMA17 1.8°/step 1.2A 4.4kg・cm 位置決め用', '個', 60, 5, 'モーター技研', 'ELEC', 2800.00, '位置決め用'),
('SENSOR-PT100-CLASSA', '温度センサ PT100 測定範囲-40～150℃ クラスA 温度監視用', '個', 45, 8, 'センサーテック', 'ELEC', 1250.00, '温度監視用'),
('BEARING-608ZZ-8X22X7', 'ボールベアリング 608ZZ 内径8×外径22×厚み7mm 回転支持用', '個', 21, 20, '日本ベアリング', 'MECH', 85.00, '回転支持用'),

-- 仕様なしの例（部品コードだけで十分な場合）
('M6-20-SUS-STD', NULL, '個', 14, 50, '関西ボルト工業', 'MECH', 15.00, '標準ボルト'),
('LED-WHITE-5MM', NULL, '個', 21, 200, '東京電子商事', 'ELEC', 40.00, '白色LED'),
('TEMP-PART-001', NULL, '個', 7, 0, NULL, 'MECH', 0.00, '仮登録部品')

ON DUPLICATE KEY UPDATE
    specification = VALUES(specification),
    unit = VALUES(unit),
    lead_time_days = VALUES(lead_time_days),
    safety_stock = VALUES(safety_stock),
    supplier = VALUES(supplier),
    category = VALUES(category),
    unit_price = VALUES(unit_price),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 5. 検索・表示用VIEW（部品コードのみ設計用）
CREATE OR REPLACE VIEW parts_search AS
SELECT 
    part_code,
    specification,
    CASE 
      WHEN specification IS NOT NULL THEN CONCAT(part_code, ' - ', LEFT(specification, 50), '...')
      ELSE part_code
    END as display_description,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price,
    is_active,
    created_at,
    updated_at
FROM parts
WHERE is_active = TRUE;

-- 6. データ確認用クエリ実行
SELECT 
    '部品マスタデータ投入完了（部品コードのみ設計）' as status,
    COUNT(*) as total_parts,
    NOW() as completed_time
FROM parts;