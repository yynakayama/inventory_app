-- ==========================================
-- 在庫管理システム - 部品マスタテーブル作成SQL
-- ==========================================
-- 製造業向け部品マスタの作成と初期データ投入

-- 1. 部品マスタテーブル作成
-- 製品を構成する全ての部品（ボルト、電子部品、樹脂部品等）を管理
CREATE TABLE IF NOT EXISTS parts (
    part_code VARCHAR(20) PRIMARY KEY COMMENT '部品コード（例：M6-20-SUS）',
    part_name VARCHAR(100) NOT NULL COMMENT '部品名',
    specification VARCHAR(200) NULL COMMENT '規格・仕様（材質、寸法等）',
    unit VARCHAR(10) DEFAULT '個' COMMENT '単位（個、kg、m等）',
    lead_time_days INT DEFAULT 7 COMMENT '調達リードタイム（日数）',
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
    INDEX idx_part_name (part_name),
    INDEX idx_category (category),
    INDEX idx_supplier (supplier),
    INDEX idx_active (is_active),
    INDEX idx_lead_time (lead_time_days)
) COMMENT='部品マスタテーブル - 製品構成部品の基本情報管理';

-- 2. 部品カテゴリマスタテーブル（将来の拡張用）
-- 部品の分類管理用
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

-- 4. 初期データ投入 - 部品マスタ
-- 実際の製造業でよく使用される部品データ
INSERT INTO parts (
    part_code, part_name, specification, unit, lead_time_days, 
    safety_stock, supplier, category, unit_price, remarks
) VALUES
-- 機械部品（ボルト・ナット類）
('M6-20-SUS', 'ステンレスボルト M6×20', 'SUS304 六角ボルト', '個', 14, 100, '関西ボルト工業', 'MECH', 15.50, '一般締結用'),
('M6-25-SUS', 'ステンレスボルト M6×25', 'SUS304 六角ボルト', '個', 14, 50, '関西ボルト工業', 'MECH', 18.00, '一般締結用'),
('M8-30-SUS', 'ステンレスボルト M8×30', 'SUS304 六角ボルト', '個', 14, 80, '関西ボルト工業', 'MECH', 25.00, '重要締結用'),
('NUT-M6-SUS', 'ステンレスナット M6', 'SUS304 六角ナット', '個', 14, 200, '関西ボルト工業', 'MECH', 8.50, 'M6ボルト用'),
('NUT-M8-SUS', 'ステンレスナット M8', 'SUS304 六角ナット', '個', 14, 150, '関西ボルト工業', 'MECH', 12.00, 'M8ボルト用'),
('WSH-M6-SUS', 'ステンレスワッシャー M6', 'SUS304 平ワッシャー', '個', 14, 300, '関西ボルト工業', 'MECH', 5.00, '座面保護用'),

-- 電子部品
('LED-R-5MM', '赤色LED 5mm', '順方向電圧2.1V 20mA', '個', 21, 500, '東京電子商事', 'ELEC', 35.00, '表示灯用'),
('LED-G-5MM', '緑色LED 5mm', '順方向電圧2.2V 20mA', '個', 21, 500, '東京電子商事', 'ELEC', 35.00, '表示灯用'),
('LED-B-5MM', '青色LED 5mm', '順方向電圧3.2V 20mA', '個', 21, 300, '東京電子商事', 'ELEC', 45.00, '表示灯用'),
('RES-1K-1/4W', '抵抗器 1kΩ 1/4W', '炭素皮膜抵抗 ±5%', '個', 21, 1000, '東京電子商事', 'ELEC', 8.00, '一般用途'),
('RES-10K-1/4W', '抵抗器 10kΩ 1/4W', '炭素皮膜抵抗 ±5%', '個', 21, 800, '東京電子商事', 'ELEC', 8.00, '一般用途'),
('CAP-100uF-25V', '電解コンデンサ 100μF 25V', 'アルミ電解コンデンサ', '個', 21, 200, '東京電子商事', 'ELEC', 25.00, '電源回路用'),

-- 樹脂部品
('CASE-ABS-100', 'ABSケース 100×60×25', 'ABS樹脂 難燃性UL94-V0', '個', 28, 50, '大阪プラスチック', 'RESIN', 180.00, '電子機器筐体'),
('CASE-ABS-150', 'ABSケース 150×90×35', 'ABS樹脂 難燃性UL94-V0', '個', 28, 30, '大阪プラスチック', 'RESIN', 280.00, '電子機器筐体'),
('BTN-BLACK-12', '押しボタン 黒 φ12mm', 'ポリアセタール製', '個', 21, 100, '京都樹脂工業', 'RESIN', 95.00, '操作用ボタン'),
('BTN-RED-12', '押しボタン 赤 φ12mm', 'ポリアセタール製', '個', 21, 80, '京都樹脂工業', 'RESIN', 95.00, '非常停止用'),

-- 金属加工品
('PLATE-AL-100', 'アルミプレート 100×100×3', 'A5052 アルマイト処理', '個', 35, 20, '神戸金属加工', 'METAL', 450.00, '基板用プレート'),
('PLATE-AL-150', 'アルミプレート 150×150×3', 'A5052 アルマイト処理', '個', 35, 15, '神戸金属加工', 'METAL', 680.00, '基板用プレート'),
('BRACKET-L50', 'L型ブラケット 50×50×3', 'SPCC 亜鉛メッキ', '個', 28, 30, '神戸金属加工', 'METAL', 120.00, '取付用金具'),
('SHAFT-6-100', 'ステンレス軸 φ6×100', 'SUS304 研磨仕上げ', '個', 42, 10, '精密シャフト工業', 'METAL', 380.00, '回転軸用'),

-- 包装材料
('BOX-CARD-S', 'ダンボール箱 小', '3層構造 180×120×80mm', '個', 7, 200, '梱包資材センター', 'PACK', 45.00, '製品梱包用'),
('BOX-CARD-M', 'ダンボール箱 中', '3層構造 250×180×120mm', '個', 7, 150, '梱包資材センター', 'PACK', 68.00, '製品梱包用'),
('BUBBLE-300', 'エアキャップ 300mm幅', '3層構造 厚み4mm', 'm', 7, 100, '梱包資材センター', 'PACK', 85.00, '緩衝材'),
('TAPE-50-BR', '梱包テープ 透明 50mm', 'OPPテープ 長さ100m', '個', 7, 50, '梱包資材センター', 'PACK', 180.00, 'ダンボール封緘用'),

-- 特殊部品・高価格帯
('MOTOR-STEP-17', 'ステッピングモータ NEMA17', '1.8°/step 1.2A 4.4kg・cm', '個', 60, 5, 'モーター技研', 'ELEC', 2800.00, '位置決め用'),
('SENSOR-TEMP-PT100', '温度センサ PT100', '測定範囲-40～150℃ クラスA', '個', 45, 8, 'センサーテック', 'ELEC', 1250.00, '温度監視用'),
('BEARING-608ZZ', 'ボールベアリング 608ZZ', '内径8×外径22×厚み7mm', '個', 21, 20, '日本ベアリング', 'MECH', 85.00, '回転支持用')

ON DUPLICATE KEY UPDATE
    part_name = VALUES(part_name),
    specification = VALUES(specification),
    unit = VALUES(unit),
    lead_time_days = VALUES(lead_time_days),
    safety_stock = VALUES(safety_stock),
    supplier = VALUES(supplier),
    category = VALUES(category),
    unit_price = VALUES(unit_price),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 5. データ確認用クエリ実行
-- 投入したデータの確認
SELECT 
    '部品マスタデータ投入完了' as status,
    COUNT(*) as total_parts,
    NOW() as completed_time
FROM parts;

-- カテゴリ別部品数確認
SELECT 
    p.category,
    pc.category_name,
    COUNT(*) as parts_count,
    AVG(p.unit_price) as avg_price
FROM parts p
LEFT JOIN part_categories pc ON p.category = pc.category_code
WHERE p.is_active = TRUE
GROUP BY p.category, pc.category_name
ORDER BY pc.sort_order;

-- 高価格部品の確認（1000円以上）
SELECT 
    part_code,
    part_name,
    unit_price,
    supplier,
    lead_time_days
FROM parts 
WHERE unit_price >= 1000 
ORDER BY unit_price DESC;

-- リードタイム別部品数
SELECT 
    CASE 
        WHEN lead_time_days <= 7 THEN '短期（1週間以内）'
        WHEN lead_time_days <= 21 THEN '中期（3週間以内）'
        WHEN lead_time_days <= 42 THEN '長期（6週間以内）'
        ELSE '超長期（6週間超）'
    END as lead_time_category,
    COUNT(*) as parts_count
FROM parts 
WHERE is_active = TRUE
GROUP BY 
    CASE 
        WHEN lead_time_days <= 7 THEN '短期（1週間以内）'
        WHEN lead_time_days <= 21 THEN '中期（3週間以内）'
        WHEN lead_time_days <= 42 THEN '長期（6週間以内）'
        ELSE '超長期（6週間超）'
    END
ORDER BY MIN(lead_time_days);