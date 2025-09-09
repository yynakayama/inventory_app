-- ==========================================
-- 在庫管理システム - 生産計画関連テーブル作成SQL
-- ==========================================

-- 1. 生産計画テーブル作成
CREATE TABLE IF NOT EXISTS production_plans (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '生産計画ID',
    building_no VARCHAR(10) NULL COMMENT '生産拠点（棟番号）',
    product_code VARCHAR(20) NOT NULL COMMENT '製品コード',
    planned_quantity INTEGER NOT NULL COMMENT '生産予定数量',
    start_date DATE NOT NULL COMMENT '生産開始予定日',
    status ENUM('計画', '生産中', '完了', 'キャンセル') DEFAULT '計画' COMMENT '計画ステータス',
    remarks TEXT NULL COMMENT '備考',
    created_by VARCHAR(50) DEFAULT 'system' COMMENT '作成者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- 外部キー制約
    FOREIGN KEY (product_code) REFERENCES products(product_code) ON DELETE RESTRICT,
    
    -- インデックス作成
    INDEX idx_product_code (product_code),
    INDEX idx_start_date (start_date),
    INDEX idx_status (status),
    INDEX idx_building_no (building_no),
    INDEX idx_created_at (created_at)
) COMMENT='生産計画テーブル';

-- 2. 在庫予約テーブル作成
CREATE TABLE IF NOT EXISTS inventory_reservations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '予約ID',
    production_plan_id BIGINT NOT NULL COMMENT '生産計画ID',
    part_code VARCHAR(30) NOT NULL COMMENT '部品コード',
    reserved_quantity INTEGER NOT NULL COMMENT '予約数量',
    reservation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '予約日時',
    remarks TEXT NULL COMMENT '備考',
    created_by VARCHAR(50) DEFAULT 'system' COMMENT '作成者',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時',
    
    -- 外部キー制約
    FOREIGN KEY (production_plan_id) REFERENCES production_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (part_code) REFERENCES parts(part_code) ON DELETE RESTRICT,
    
    -- ユニーク制約（同一生産計画・同一部品の重複予約を防ぐ）
    UNIQUE KEY uk_plan_part (production_plan_id, part_code),
    
    -- インデックス作成
    INDEX idx_production_plan_id (production_plan_id),
    INDEX idx_part_code (part_code),
    INDEX idx_reservation_date (reservation_date)
) COMMENT='在庫予約テーブル（生産計画による部品在庫の予約管理）';

-- 3. 生産計画詳細VIEW作成（所要量計算用）
CREATE OR REPLACE VIEW production_plan_requirements AS
SELECT 
    pp.id as plan_id,
    pp.building_no,
    pp.product_code,
    pp.planned_quantity,
    pp.start_date,
    pp.status as plan_status,
    pp.remarks as plan_remarks,
    br.station_code,
    br.process_group,
    br.part_code,
    br.part_specification,
    br.unit_quantity,
    (br.unit_quantity * pp.planned_quantity) as required_quantity,
    br.supplier,
    br.lead_time_days,
    pp.created_at as plan_created_at
FROM production_plans pp
    INNER JOIN bom_requirements br ON pp.product_code = br.product_code
WHERE pp.status IN ('計画', '生産中')
ORDER BY pp.id, br.process_group, br.station_code, br.part_code;

-- 4. 在庫充足性チェック用VIEW作成
CREATE OR REPLACE VIEW inventory_sufficiency_check AS
SELECT 
    ppr.plan_id,
    ppr.product_code,
    ppr.planned_quantity,
    ppr.start_date,
    ppr.part_code,
    ppr.required_quantity,
    
    -- 在庫情報
    COALESCE(i.current_stock, 0) as current_stock,
    -- 開始予定日が早い計画の必要数量合計を予約済数量として計算
    COALESCE(
        (SELECT SUM(required_quantity) 
         FROM production_plan_requirements other_ppr 
         WHERE other_ppr.part_code = ppr.part_code 
         AND other_ppr.plan_id != ppr.plan_id
         AND other_ppr.plan_status IN ('計画', '生産中')
         AND other_ppr.start_date < ppr.start_date), 0
    ) as total_reserved_stock,
    COALESCE(ir.reserved_quantity, 0) as plan_reserved_quantity,
    
    -- 予定入荷情報（生産開始日まで）
    COALESCE(
        (SELECT SUM(scheduled_quantity) 
         FROM scheduled_receipts sr 
         WHERE sr.part_code = ppr.part_code 
         AND sr.status = '入荷予定'
         AND sr.scheduled_date <= ppr.start_date), 0
    ) as scheduled_receipts_until_start,
    
    -- 利用可能在庫計算（開始予定日が早い計画の必要数量を差し引く）
    (COALESCE(i.current_stock, 0) + 
     COALESCE(
        (SELECT SUM(scheduled_quantity) 
         FROM scheduled_receipts sr 
         WHERE sr.part_code = ppr.part_code 
         AND sr.status = '入荷予定'
         AND sr.scheduled_date <= ppr.start_date), 0
     ) - 
     COALESCE(
        (SELECT SUM(required_quantity) 
         FROM production_plan_requirements other_ppr 
         WHERE other_ppr.part_code = ppr.part_code 
         AND other_ppr.plan_id != ppr.plan_id
         AND other_ppr.plan_status IN ('計画', '生産中')
         AND other_ppr.start_date < ppr.start_date), 0
     )
    ) as available_stock,
    
    -- 過不足判定（開始予定日が早い計画の必要数量を考慮）
    (ppr.required_quantity - 
     (COALESCE(i.current_stock, 0) + 
      COALESCE(
        (SELECT SUM(scheduled_quantity) 
         FROM scheduled_receipts sr 
         WHERE sr.part_code = ppr.part_code 
         AND sr.status = '入荷予定'
         AND sr.scheduled_date <= ppr.start_date), 0
      ) - 
      COALESCE(
        (SELECT SUM(required_quantity) 
         FROM production_plan_requirements other_ppr 
         WHERE other_ppr.part_code = ppr.part_code 
         AND other_ppr.plan_id != ppr.plan_id
         AND other_ppr.plan_status IN ('計画', '生産中')
         AND other_ppr.start_date < ppr.start_date), 0
      )
     )
    ) as shortage_quantity,
    
    -- 調達必要日計算（生産開始日 - リードタイム）
    DATE_SUB(ppr.start_date, INTERVAL ppr.lead_time_days DAY) as procurement_due_date,
    
    ppr.supplier,
    ppr.lead_time_days
    
FROM production_plan_requirements ppr
    LEFT JOIN inventory i ON ppr.part_code = i.part_code
    LEFT JOIN inventory_reservations ir ON ppr.plan_id = ir.production_plan_id 
                                        AND ppr.part_code = ir.part_code
ORDER BY ppr.plan_id, ppr.part_code;

-- 5. 初期テストデータ投入
INSERT INTO production_plans (building_no, product_code, planned_quantity, start_date, status, remarks, created_by) VALUES
('1棟', 'V5000', 10, '2025-01-30', '計画', 'テスト用生産計画1', 'test_user'),
('2棟', 'D2000', 5, '2025-02-01', '計画', 'テスト用生産計画2', 'test_user'),
('1棟', 'V5000', 15, '2025-02-05', '計画', 'テスト用生産計画3', 'test_user')
ON DUPLICATE KEY UPDATE
    planned_quantity = VALUES(planned_quantity),
    start_date = VALUES(start_date),
    status = VALUES(status),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 6. 在庫予約テーブル初期化（テスト用）
-- 注意: 実際の運用では、APIを通じて自動的に予約データが作成されます
INSERT INTO inventory_reservations (production_plan_id, part_code, reserved_quantity, remarks, created_by) VALUES
(1, 'LED-RED-5MM-20MA', 20, 'V5000生産計画1用予約', 'test_user'),
(1, 'LED-GREEN-5MM-20MA', 10, 'V5000生産計画1用予約', 'test_user'),
(1, 'RES-1K-1/4W-5PCT', 40, 'V5000生産計画1用予約', 'test_user')
ON DUPLICATE KEY UPDATE
    reserved_quantity = VALUES(reserved_quantity),
    remarks = VALUES(remarks),
    updated_at = CURRENT_TIMESTAMP;

-- 7. 在庫テーブルの予約在庫数を更新（テスト用）
-- 注意: 実際の運用では、APIを通じて自動的に更新されます
UPDATE inventory SET 
    reserved_stock = (
        SELECT COALESCE(SUM(reserved_quantity), 0)
        FROM inventory_reservations ir 
        WHERE ir.part_code = inventory.part_code
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE part_code IN (
    SELECT DISTINCT part_code FROM inventory_reservations
);

-- 8. データ確認用クエリ実行
SELECT 
    '生産計画関連テーブル作成完了' as status,
    (SELECT COUNT(*) FROM production_plans) as production_plans_count,
    (SELECT COUNT(*) FROM inventory_reservations) as reservations_count,
    NOW() as completed_time;

-- 9. VIEW動作確認用クエリ
SELECT 'VIEW動作確認' as check_type;

-- 生産計画所要量VIEW確認
SELECT 
    plan_id,
    product_code,
    planned_quantity,
    part_code,
    unit_quantity,
    required_quantity
FROM production_plan_requirements
WHERE plan_id = 1
LIMIT 5;

-- 在庫充足性チェックVIEW確認
SELECT 
    plan_id,
    part_code,
    required_quantity,
    current_stock,
    available_stock,
    shortage_quantity,
    CASE 
        WHEN shortage_quantity > 0 THEN '不足'
        ELSE '充足'
    END as sufficiency_status
FROM inventory_sufficiency_check
WHERE plan_id = 1
LIMIT 5;