// ==========================================
// 生産計画管理 - CRUD操作
// ファイル: src/routes/production-plans/crud-operations.js
// 目的: 生産計画の作成・読み取り・更新・削除機能
// ==========================================

const express = require('express');
const router = express.Router();
const reservationManager = require('./reservation-manager');

// 認証ミドルウェアをインポート
const { 
    requireReadAccess, 
    requireProductionAccess 
} = require('../../middleware/auth');

// ★★★ リファクタリングで追加 ★★★
// 所要量計算の簡易版。部材不足の有無のみをチェックする。
async function checkShortageForPlan(connection, planId) {
    const [requirements] = await connection.execute(
        `SELECT shortage_quantity FROM inventory_sufficiency_check WHERE plan_id = ?`,
        [planId]
    );
    // BOMが未設定、または所要量計算ビューが結果を返さない場合
    if (requirements.length === 0) {
        return false;
    }
    // 1つでも不足数量が0より大きい部品があればtrueを返す
    const hasShortage = requirements.some(req => req.shortage_quantity > 0);
    return hasShortage;
}
// ★★★ ここまで ★★★

// ==========================================
// 1. 生産計画一覧取得（全認証ユーザー可）
// GET /api/plans
// ==========================================
router.get('/', requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 📋 生産計画一覧取得開始: ユーザー=${req.user.username} (${req.user.role})`);
        
        const {
            product_code,
            status,
            building_no,
            start_date_from,
            start_date_to,
            exclude_completed
        } = req.query;
        
        connection = await req.mysql.createConnection(req.dbConfig);
        
        let whereConditions = ["pp.status != 'キャンセル'"];
        let queryParams = [];
        
        if (product_code) {
            whereConditions.push("pp.product_code = ?");
            queryParams.push(product_code);
        }
        if (status) {
            whereConditions.push("pp.status = ?");
            queryParams.push(status);
        }
        if (building_no) {
            whereConditions.push("pp.building_no LIKE ?");
            queryParams.push(`%${building_no}%`);
        }
        if (start_date_from) {
            whereConditions.push("pp.start_date >= ?");
            queryParams.push(start_date_from);
        }
        if (start_date_to) {
            whereConditions.push("pp.start_date <= ?");
            queryParams.push(start_date_to);
        }
        if (exclude_completed === 'true') {
            whereConditions.push("pp.status != '完了'");
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const query = `
            SELECT 
                pp.id, pp.building_no, pp.product_code, pp.planned_quantity,
                pp.start_date, pp.status, pp.remarks, pp.created_by,
                pp.created_at, pp.updated_at, p.remarks as product_remarks
            FROM production_plans pp
            LEFT JOIN products p ON pp.product_code = p.product_code
            WHERE ${whereClause}
            ORDER BY pp.start_date DESC, pp.created_at DESC
        `;

        const [results] = await connection.execute(query, queryParams);

        const formattedResults = results.map(plan => ({
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        }));

        // ★★★ リファクタリングによる修正箇所 ★★★
        const plansWithShortageInfo = await Promise.all(
            formattedResults.map(async (plan) => {
                // 「計画」ステータスの場合のみ不足チェックを実行
                // 「生産中」は既に部材を消費済みなので不足チェック不要
                if (plan.status === '計画') {
                    const hasShortage = await checkShortageForPlan(connection, plan.id);
                    return { ...plan, has_shortage: hasShortage };
                }
                return { ...plan, has_shortage: false };
            })
        );
        // ★★★ ここまで ★★★

        console.log(`✅ 生産計画一覧取得完了: ${plansWithShortageInfo.length}件`);
        
        res.json({
            success: true,
            data: plansWithShortageInfo, // 修正：フラグ付きのデータを返す
            count: plansWithShortageInfo.length,
            message: `生産計画一覧を${plansWithShortageInfo.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 生産計画一覧取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産計画一覧の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 生産計画詳細取得（全認証ユーザー可）
// GET /api/plans/:id
// ==========================================
router.get('/:id', requireReadAccess, async (req, res) => {
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

        console.log(`[${new Date().toISOString()}] 🔍 生産計画詳細取得開始: ID=${planId}, ユーザー=${req.user.username}`);
        
        connection = await req.mysql.createConnection(req.dbConfig);

        const query = `
            SELECT 
                pp.id,
                pp.building_no,
                pp.product_code,
                pp.planned_quantity,
                pp.start_date,
                pp.status,
                pp.remarks,
                pp.created_by,
                pp.created_at,
                pp.updated_at,
                p.remarks as product_remarks
            FROM production_plans pp
            LEFT JOIN products p ON pp.product_code = p.product_code
            WHERE pp.id = ?
        `;

        const [results] = await connection.execute(query, [planId]);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません',
                error: 'PLAN_NOT_FOUND',
                plan_id: planId
            });
        }

        const plan = results[0];
        const formattedPlan = {
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        };

        console.log(`✅ 生産計画詳細取得完了: ${plan.product_code}`);
        
        res.json({
            success: true,
            data: formattedPlan,
            message: `生産計画 ${planId} の詳細情報を取得しました`
        });

    } catch (error) {
        console.error('❌ 生産計画詳細取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産計画詳細の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. 生産計画登録（生産管理権限必要）
// POST /api/plans
// ==========================================
router.post('/', requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const {
            building_no,
            product_code,
            planned_quantity,
            start_date,
            status = '計画',
            remarks,
            created_by = req.user.username
        } = req.body;

        console.log(`[${new Date().toISOString()}] ➕ 生産計画登録開始: ユーザー=${req.user.username}, 製品=${product_code}, 数量=${planned_quantity}`);

        // 入力値バリデーション
        const validationError = validatePlanData({
            product_code,
            planned_quantity,
            start_date,
            status
        });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
                error: 'VALIDATION_ERROR'
            });
        }

        connection = await req.mysql.createConnection(req.dbConfig);
        await connection.beginTransaction();

        // 製品コード存在チェック
        const [productResults] = await connection.execute(
            'SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE',
            [product_code]
        );

        if (productResults.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: '指定された製品コードが見つかりません',
                error: 'PRODUCT_NOT_FOUND'
            });
        }

        // 生産計画登録
        const insertQuery = `
            INSERT INTO production_plans (
                building_no, 
                product_code, 
                planned_quantity, 
                start_date, 
                status, 
                remarks, 
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        const values = [
            building_no,
            product_code,
            parseInt(planned_quantity),
            start_date,
            status,
            remarks,
            created_by
        ];

        const [insertResult] = await connection.execute(insertQuery, values);
        const newPlanId = insertResult.insertId;

        console.log(`✅ 生産計画登録成功: ID=${newPlanId}`);

        // 自動予約作成（計画・生産中ステータスの場合のみ）
        let reservations = [];
        
        if (status === '計画' || status === '生産中') {
            console.log(`🔄 在庫予約作成中: ステータス「${status}」`);
            
            try {
                reservations = await reservationManager.createReservations(
                    connection, 
                    newPlanId, 
                    product_code, 
                    parseInt(planned_quantity), 
                    created_by
                );
            } catch (reservationError) {
                console.error('❌ 在庫予約作成エラー:', reservationError);
                await connection.rollback();
                return res.status(500).json({
                    success: false,
                    message: '在庫予約の作成に失敗しました',
                    error: process.env.NODE_ENV === 'development' ? reservationError.message : undefined
                });
            }
        }

        await connection.commit();

        console.log(`🎉 生産計画登録完了: 計画ID=${newPlanId}, 予約=${reservations.length}件`);
        
        res.status(201).json({
            success: true,
            message: `生産計画が正常に登録されました（予約: ${reservations.length}件）`,
            data: {
                id: newPlanId,
                building_no,
                product_code,
                planned_quantity: parseInt(planned_quantity),
                start_date,
                status,
                remarks,
                created_by,
                reservations: reservations
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 生産計画登録エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産計画登録中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 4. 生産計画更新（生産管理権限必要）
// PUT /api/plans/:id
// ==========================================
router.put('/:id', requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const planId = parseInt(req.params.id);
        const {
            building_no,
            product_code,
            planned_quantity,
            start_date,
            status,
            remarks
        } = req.body;

        if (isNaN(planId)) {
            return res.status(400).json({
                success: false,
                message: '無効な生産計画IDです',
                error: 'INVALID_PLAN_ID'
            });
        }

        console.log(`[${new Date().toISOString()}] ✏️ 生産計画更新開始: ID=${planId}, ユーザー=${req.user.username}`);

        // 入力値バリデーション
        const validationError = validatePlanData({
            product_code,
            planned_quantity,
            start_date,
            status
        });

        if (validationError) {
            return res.status(400).json({
                success: false,
                message: validationError,
                error: 'VALIDATION_ERROR'
            });
        }

        connection = await req.mysql.createConnection(req.dbConfig);
        await connection.beginTransaction();

        // 生産計画存在チェック
        const [planResults] = await connection.execute(
            'SELECT id, status as old_status FROM production_plans WHERE id = ?',
            [planId]
        );

        if (planResults.length === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません',
                error: 'PLAN_NOT_FOUND'
            });
        }

        // 製品コード存在チェック
        const [productResults] = await connection.execute(
            'SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE',
            [product_code]
        );

        if (productResults.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: '指定された製品コードが見つかりません',
                error: 'PRODUCT_NOT_FOUND'
            });
        }

        const newStatus = status || '計画';

        // 生産計画更新
        const updateQuery = `
            UPDATE production_plans SET 
                building_no = ?, 
                product_code = ?, 
                planned_quantity = ?, 
                start_date = ?, 
                status = ?, 
                remarks = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        const values = [
            building_no,
            product_code,
            parseInt(planned_quantity),
            start_date,
            newStatus,
            remarks,
            planId
        ];

        const [updateResult] = await connection.execute(updateQuery, values);

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({
                success: false,
                message: '更新対象の生産計画が見つかりません',
                error: 'UPDATE_TARGET_NOT_FOUND'
            });
        }

        console.log(`✅ 生産計画更新成功: ID=${planId}`);

        // 予約更新処理
        let updateInfo;
        
        try {
            updateInfo = await reservationManager.updateReservations(
                connection,
                planId,
                product_code,
                parseInt(planned_quantity),
                newStatus,
                req.user.username
            );
        } catch (reservationError) {
            console.error('❌ 予約更新エラー:', reservationError);
            await connection.rollback();
            return res.status(500).json({
                success: false,
                message: '在庫予約の更新に失敗しました',
                error: process.env.NODE_ENV === 'development' ? reservationError.message : undefined
            });
        }

        await connection.commit();

        console.log(`🎉 生産計画更新完了: 計画ID=${planId}, 予約更新=${updateInfo.action}`);
        
        res.json({
            success: true,
            message: updateInfo.message,
            data: {
                id: planId,
                building_no,
                product_code,
                planned_quantity: parseInt(planned_quantity),
                start_date,
                status: newStatus,
                remarks,
                updated_by: req.user.username,
                reservation_update: updateInfo
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 生産計画更新エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産計画更新中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 5. 生産計画削除（生産管理権限必要）
// DELETE /api/plans/:id
// ==========================================
router.delete('/:id', requireProductionAccess, async (req, res) => {
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

        console.log(`[${new Date().toISOString()}] 🗑️ 生産計画削除開始: ID=${planId}, ユーザー=${req.user.username}`);

        connection = await req.mysql.createConnection(req.dbConfig);

        // 生産計画存在チェック
        const [results] = await connection.execute(
            'SELECT id, status, product_code, planned_quantity FROM production_plans WHERE id = ?',
            [planId]
        );

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません',
                error: 'PLAN_NOT_FOUND'
            });
        }

        const plan = results[0];

        // 予約数確認
        const [reservationResults] = await connection.execute(
            'SELECT COUNT(*) as reservation_count FROM inventory_reservations WHERE production_plan_id = ?',
            [planId]
        );

        const reservationCount = reservationResults[0].reservation_count;
        console.log(`📊 予約確認: ${reservationCount}件の予約が存在`);

        // 削除実行（CASCADE設定により関連予約も自動削除される）
        const [deleteResult] = await connection.execute(
            'DELETE FROM production_plans WHERE id = ?',
            [planId]
        );

        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: '削除対象の生産計画が見つかりません',
                error: 'DELETE_TARGET_NOT_FOUND'
            });
        }

        console.log(`🎉 生産計画削除完了: 計画ID=${planId}, 予約削除=${reservationCount}件`);
        
        res.json({
            success: true,
            message: `生産計画（ID: ${planId}）が正常に削除され、${reservationCount}件の在庫予約も自動解除されました`,
            data: {
                id: planId,
                deleted_plan: plan,
                deleted_reservations_count: reservationCount,
                deleted_by: req.user.username
            }
        });

    } catch (error) {
        console.error('❌ 生産計画削除エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産計画削除中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 6. ステータス別生産計画取得（全認証ユーザー可）
// GET /api/plans/status/:status
// ==========================================
router.get('/status/:status', requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const status = req.params.status;
        
        console.log(`[${new Date().toISOString()}] 📋 ステータス別取得開始: ${status}, ユーザー=${req.user.username}`);
        
        const validStatuses = ['計画', '生産中', '完了', 'キャンセル'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: '無効なステータスです',
                error: 'INVALID_STATUS',
                valid_statuses: validStatuses
            });
        }

        connection = await req.mysql.createConnection(req.dbConfig);

        const query = `
            SELECT 
                pp.id,
                pp.building_no,
                pp.product_code,
                pp.planned_quantity,
                pp.start_date,
                pp.status,
                pp.remarks,
                pp.created_by,
                pp.created_at,
                pp.updated_at,
                p.remarks as product_remarks
            FROM production_plans pp
            LEFT JOIN products p ON pp.product_code = p.product_code
            WHERE pp.status = ?
            ORDER BY pp.start_date DESC, pp.created_at DESC
        `;

        const [results] = await connection.execute(query, [status]);

        // 日付フォーマット調整
        const formattedResults = results.map(plan => ({
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        }));

        console.log(`✅ ステータス別取得完了: ${formattedResults.length}件`);
        
        res.json({
            success: true,
            data: formattedResults,
            count: formattedResults.length,
            status: status,
            message: `ステータス「${status}」の生産計画を${formattedResults.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ ステータス別生産計画取得エラー:', error);
        res.status(500).json({
            success: false,
            message: 'ステータス別生産計画の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// バリデーション関数
// ==========================================
function validatePlanData({ product_code, planned_quantity, start_date, status }) {
    // 必須項目チェック
    if (!product_code || !planned_quantity || !start_date) {
        return '必須項目が不足しています（製品コード、生産数量、開始日）';
    }

    // 数値バリデーション
    if (isNaN(planned_quantity) || planned_quantity <= 0) {
        return '生産数量は正の数値で入力してください';
    }

    // 日付バリデーション
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(start_date)) {
        return '開始日はYYYY-MM-DD形式で入力してください';
    }

    // ステータスバリデーション
    if (status) {
        const validStatuses = ['計画', '生産中', '完了', 'キャンセル'];
        if (!validStatuses.includes(status)) {
            return '無効なステータスです';
        }
    }

    return null; // バリデーション成功
}

module.exports = router;
