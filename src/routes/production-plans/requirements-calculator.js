// ==========================================
// 所要量計算モジュール
// ファイル: src/routes/production-plans/requirements-calculator.js
// 目的: 生産計画から必要部品とその数量を算出し、在庫充足性をチェック
// ==========================================

const express = require('express');
const router = express.Router();

// 認証ミドルウェアをインポート
const { requireReadAccess } = require('../../middleware/auth');

/**
 * 所要量計算の専門処理を担当するモジュール
 * 生産計画から必要部品とその数量を算出し、在庫充足性をチェック
 * 
 * 【権限設計】
 * - 所要量計算は参照系機能のため、全認証ユーザーがアクセス可能
 */

// ==========================================
// 所要量計算機能（全認証ユーザー可）
// POST /api/plans/:id/requirements
// ==========================================
router.post('/:id/requirements', requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const planId = parseInt(req.params.id);
        
        if (isNaN(planId)) {
            return res.status(400).json({
                success: false,
                message: '無効な生産計画IDです',
                error: 'INVALID_PLAN_ID'
            });
        }

        console.log(`[${new Date().toISOString()}] 📊 所要量計算開始: 計画ID=${planId}, ユーザー=${req.user.username} (${req.user.role})`);

        connection = await req.mysql.createConnection(req.dbConfig);

        // 1. 生産計画の存在チェック
        const [planResults] = await connection.execute(
            `SELECT id, product_code, planned_quantity, start_date, status 
             FROM production_plans 
             WHERE id = ?`,
            [planId]
        );

        if (planResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません',
                error: 'PLAN_NOT_FOUND',
                plan_id: planId
            });
        }

        const planInfo = planResults[0];
        console.log(`✅ 計画情報取得: ${planInfo.product_code} × ${planInfo.planned_quantity}個`);

        // 2. ステータスチェック（完了・キャンセル済みは計算不要）
        if (planInfo.status === '完了' || planInfo.status === 'キャンセル') {
            return res.status(400).json({
                success: false,
                message: `ステータス「${planInfo.status}」の生産計画は所要量計算できません`,
                error: 'INVALID_STATUS_FOR_CALCULATION'
            });
        }

        // 3. 在庫充足性チェック付き所要量計算
        const calculationResult = await performRequirementsCalculation(connection, planId, planInfo);

        // 実行ユーザー情報を追加
        calculationResult.data.calculated_by = {
            username: req.user.username,
            role: req.user.role,
            calculation_time: new Date().toISOString()
        };

        console.log(`✅ 所要量計算完了: ユーザー=${req.user.username}`);
        res.json(calculationResult);

    } catch (error) {
        console.error('❌ 所要量計算エラー:', error);
        res.status(500).json({
            success: false,
            message: '所要量計算中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 所要量計算の主処理
// ==========================================

/**
 * 所要量計算と在庫充足性チェックを実行
 * @param {Object} connection - データベース接続
 * @param {number} planId - 生産計画ID
 * @param {Object} planInfo - 生産計画情報
 * @returns {Object} 計算結果
 */
async function performRequirementsCalculation(connection, planId, planInfo) {
    console.log(`🔄 所要量計算実行中...`);

    // 在庫充足性チェック付き所要量計算（inventory_sufficiency_check VIEWを使用）
    const [rawRequirements] = await connection.execute(
        `SELECT 
            plan_id,
            product_code,
            planned_quantity,
            start_date,
            part_code,
            required_quantity,
            current_stock,
            total_reserved_stock,
            plan_reserved_quantity,
            scheduled_receipts_until_start,
            available_stock,
            shortage_quantity,
            procurement_due_date,
            supplier,
            lead_time_days
        FROM inventory_sufficiency_check 
        WHERE plan_id = ?
        ORDER BY part_code`,
        [planId]
    );

    // 部品コードごとに所要量を集約
    const requirementsMap = new Map();
    for (const req of rawRequirements) {
        if (requirementsMap.has(req.part_code)) {
            const existing = requirementsMap.get(req.part_code);
            existing.required_quantity += req.required_quantity;
            // plan_reserved_quantityも同様に合算する
            existing.plan_reserved_quantity += req.plan_reserved_quantity;
        } else {
            requirementsMap.set(req.part_code, { ...req });
        }
    }

    const requirements = [];
    for (const req of requirementsMap.values()) {
        // 不足数を再計算
        req.shortage_quantity = Math.max(0, req.required_quantity - req.available_stock);
        requirements.push(req);
    }

    console.log(`📋 所要量計算結果: ${requirements.length}種類の部品`);

    // 工程別詳細情報を取得
    const stationDetails = await getStationDetails(connection, planId);

    // 計算結果を構築
    return buildCalculationResult(planInfo, requirements, stationDetails);
}

// ==========================================
// 工程別詳細情報取得
// ==========================================

/**
 * どの工程でどの部品を使用するかの詳細情報を取得
 * @param {Object} connection - データベース接続
 * @param {number} planId - 生産計画ID
 * @returns {Array} 工程別詳細データ
 */
async function getStationDetails(connection, planId) {
    const [stationDetails] = await connection.execute(
        `SELECT 
            part_code,
            station_code,
            process_group,
            unit_quantity,
            required_quantity
        FROM production_plan_requirements 
        WHERE plan_id = ?
        ORDER BY process_group, station_code, part_code`,
        [planId]
    );

    console.log(`🏭 工程詳細取得: ${stationDetails.length}件の工程-部品関係`);
    return stationDetails;
}

// ==========================================
// 計算結果構築
// ==========================================

/**
 * 所要量計算の最終結果を構築
 * @param {Object} planInfo - 生産計画情報
 * @param {Array} requirements - 所要量計算結果
 * @param {Array} stationDetails - 工程別詳細
 * @returns {Object} 計算結果
 */
function buildCalculationResult(planInfo, requirements, stationDetails) {
    console.log(`🔨 計算結果構築中...`);

    // BOM未設定チェック
    if (requirements.length === 0) {
        console.log(`⚠️ BOM未設定: 製品「${planInfo.product_code}」`);
        return {
            success: false,
            message: `製品「${planInfo.product_code}」のBOM（部品構成）が登録されていません`,
            data: {
                plan_id: parseInt(planInfo.id),
                product_code: planInfo.product_code,
                planned_quantity: planInfo.planned_quantity,
                requirements: [],
                shortage_summary: {
                    has_shortage: false,
                    shortage_parts_count: 0,
                    shortage_parts: []
                }
            }
        };
    }

    // 工程別詳細データをマップ化
    const stationMap = buildStationMap(stationDetails);

    // 不足部品を特定
    const shortageRparts = requirements.filter(req => req.shortage_quantity > 0);
    const hasShortage = shortageRparts.length > 0;

    console.log(`📊 充足性分析: 不足部品${shortageRparts.length}種類 / 総計${requirements.length}種類`);

    // 不足部品の詳細情報を構築
    const shortageParts = buildShortageDetails(shortageRparts, stationMap);

    // 最終的なレスポンスデータを構築
    const responseData = {
        plan_id: parseInt(planInfo.id),
        product_code: planInfo.product_code,
        planned_quantity: planInfo.planned_quantity,
        start_date: planInfo.start_date ? planInfo.start_date.toISOString().split('T')[0] : null,
        status: planInfo.status,

        // 部品別在庫充足性詳細
        requirements: requirements.map(req => ({
            part_code: req.part_code,
            required_quantity: req.required_quantity,
            current_stock: req.current_stock,
            total_reserved_stock: req.total_reserved_stock,
            plan_reserved_quantity: req.plan_reserved_quantity,
            scheduled_receipts_until_start: req.scheduled_receipts_until_start,
            available_stock: req.available_stock,
            shortage_quantity: req.shortage_quantity,
            is_sufficient: req.shortage_quantity <= 0,
            is_awaiting_receipt: req.current_stock < req.required_quantity && req.shortage_quantity <= 0,
            procurement_due_date: req.procurement_due_date,
            supplier: req.supplier,
            lead_time_days: req.lead_time_days,
            // 工程別使用詳細
            used_in_stations: stationMap[req.part_code] || []
        })),

        // 不足部品サマリー
        shortage_summary: {
            has_shortage: hasShortage,
            shortage_parts_count: shortageRparts.length,
            shortage_parts: shortageParts,
            total_shortage_amount: shortageRparts.reduce((sum, req) => sum + req.shortage_quantity, 0)
        },

        // 統計情報
        total_parts_count: requirements.length,
        sufficient_parts_count: requirements.filter(req => req.shortage_quantity <= 0).length,
        calculation_date: new Date().toISOString()
    };

    const message = hasShortage ? 
        `所要量計算完了 - ${shortageRparts.length}種類の部品が不足しています` :
        '所要量計算完了 - すべての部品が充足しています';

    console.log(`✅ ${message}`);

    return {
        success: true,
        message: message,
        data: responseData
    };
}

// ==========================================
// ユーティリティ関数群
// ==========================================

/**
 * 工程別詳細データをマップ化
 * @param {Array} stationDetails - 工程別詳細データ
 * @returns {Object} 部品コードをキーとしたマップ
 */
function buildStationMap(stationDetails) {
    const stationMap = {};
    
    stationDetails.forEach(detail => {
        if (!stationMap[detail.part_code]) {
            stationMap[detail.part_code] = [];
        }
        stationMap[detail.part_code].push({
            station_code: detail.station_code,
            process_group: detail.process_group,
            unit_quantity: detail.unit_quantity,
            required_quantity: detail.required_quantity
        });
    });

    return stationMap;
}

/**
 * 不足部品の詳細情報を構築
 * @param {Array} shortageRparts - 不足部品のリスト
 * @param {Object} stationMap - 工程別詳細マップ
 * @returns {Array} 不足部品の詳細配列
 */
function buildShortageDetails(shortageRparts, stationMap) {
    return shortageRparts.map(req => ({
        part_code: req.part_code,
        shortage_quantity: req.shortage_quantity,
        required_quantity: req.required_quantity,
        available_stock: req.available_stock,
        stations: stationMap[req.part_code] || [],
        procurement_due_date: req.procurement_due_date,
        supplier: req.supplier,
        lead_time_days: req.lead_time_days
    }));
}

module.exports = router;