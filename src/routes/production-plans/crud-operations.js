// ==========================================
// 生産計画管理 - CRUD操作
// File: routes/production-plans/crud-operations.js
// ==========================================

const express = require('express');
const router = express.Router();
const reservationManager = require('./reservation-manager');

// ==========================================
// 1. 生産計画一覧取得
// GET /api/plans
// ==========================================
router.get('/', (req, res) => {
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
        WHERE pp.status != 'キャンセル'
        ORDER BY pp.start_date DESC, pp.created_at DESC
    `;

    req.db.query(query, (err, results) => {
        if (err) {
            console.error('生産計画一覧取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 日付フォーマット調整
        const formattedResults = results.map(plan => ({
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        }));

        res.json({
            success: true,
            data: formattedResults,
            count: formattedResults.length
        });
    });
});

// ==========================================
// 2. 生産計画詳細取得
// GET /api/plans/:id
// ==========================================
router.get('/:id', (req, res) => {
    const planId = parseInt(req.params.id);

    if (isNaN(planId)) {
        return res.status(400).json({
            success: false,
            message: '無効な生産計画IDです'
        });
    }

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

    req.db.query(query, [planId], (err, results) => {
        if (err) {
            console.error('生産計画詳細取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません'
            });
        }

        const plan = results[0];
        const formattedPlan = {
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        };

        res.json({
            success: true,
            data: formattedPlan
        });
    });
});

// ==========================================
// 3. 生産計画登録（自動予約機能付き）
// POST /api/plans
// ==========================================
router.post('/', (req, res) => {
    const {
        building_no,
        product_code,
        planned_quantity,
        start_date,
        status = '計画',
        remarks,
        created_by = 'system'
    } = req.body;

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
            message: validationError
        });
    }

    // 製品コード存在チェック
    const checkProductQuery = 'SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE';
    
    req.db.query(checkProductQuery, [product_code], (err, productResults) => {
        if (err) {
            console.error('製品コード確認エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        if (productResults.length === 0) {
            return res.status(400).json({
                success: false,
                message: '指定された製品コードが見つかりません'
            });
        }

        // トランザクション開始
        req.db.beginTransaction((err) => {
            if (err) {
                console.error('トランザクション開始エラー:', err);
                return res.status(500).json({
                    success: false,
                    message: 'データベースエラーが発生しました',
                    error: err.message
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

            req.db.query(insertQuery, values, (err, insertResult) => {
                if (err) {
                    console.error('生産計画登録エラー:', err);
                    return req.db.rollback(() => {
                        res.status(500).json({
                            success: false,
                            message: 'データベースエラーが発生しました',
                            error: err.message
                        });
                    });
                }

                const newPlanId = insertResult.insertId;

                // 自動予約作成（計画・生産中ステータスの場合のみ）
                if (status === '計画' || status === '生産中') {
                    reservationManager.createReservations(
                        req.db, 
                        newPlanId, 
                        product_code, 
                        parseInt(planned_quantity), 
                        created_by, 
                        (err, reservations) => {
                            if (err) {
                                console.error('在庫予約作成エラー:', err);
                                return req.db.rollback(() => {
                                    res.status(500).json({
                                        success: false,
                                        message: '在庫予約の作成に失敗しました',
                                        error: err.message
                                    });
                                });
                            }

                            // トランザクションコミット
                            req.db.commit((err) => {
                                if (err) {
                                    console.error('トランザクションコミットエラー:', err);
                                    return req.db.rollback(() => {
                                        res.status(500).json({
                                            success: false,
                                            message: 'データベースエラーが発生しました',
                                            error: err.message
                                        });
                                    });
                                }

                                res.status(201).json({
                                    success: true,
                                    message: '生産計画が正常に登録され、在庫予約も作成されました',
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
                            });
                        }
                    );
                } else {
                    // 完了・キャンセルステータスの場合は予約なしでコミット
                    req.db.commit((err) => {
                        if (err) {
                            console.error('トランザクションコミットエラー:', err);
                            return req.db.rollback(() => {
                                res.status(500).json({
                                    success: false,
                                    message: 'データベースエラーが発生しました',
                                    error: err.message
                                });
                            });
                        }

                        res.status(201).json({
                            success: true,
                            message: '生産計画が正常に登録されました',
                            data: {
                                id: newPlanId,
                                building_no,
                                product_code,
                                planned_quantity: parseInt(planned_quantity),
                                start_date,
                                status,
                                remarks,
                                created_by,
                                reservations: []
                            }
                        });
                    });
                }
            });
        });
    });
});

// ==========================================
// 4. 生産計画更新（自動予約更新機能付き）
// PUT /api/plans/:id
// ==========================================
router.put('/:id', (req, res) => {
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
            message: '無効な生産計画IDです'
        });
    }

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
            message: validationError
        });
    }

    // 生産計画存在チェック
    const checkPlanQuery = 'SELECT id, status as old_status FROM production_plans WHERE id = ?';
    
    req.db.query(checkPlanQuery, [planId], (err, planResults) => {
        if (err) {
            console.error('生産計画確認エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        if (planResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません'
            });
        }

        const newStatus = status || '計画';

        // 製品コード存在チェック
        const checkProductQuery = 'SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE';
        
        req.db.query(checkProductQuery, [product_code], (err, productResults) => {
            if (err) {
                console.error('製品コード確認エラー:', err);
                return res.status(500).json({
                    success: false,
                    message: 'データベースエラーが発生しました',
                    error: err.message
                });
            }

            if (productResults.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: '指定された製品コードが見つかりません'
                });
            }

            // トランザクション開始
            req.db.beginTransaction((err) => {
                if (err) {
                    console.error('トランザクション開始エラー:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'データベースエラーが発生しました',
                        error: err.message
                    });
                }

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

                req.db.query(updateQuery, values, (err, updateResult) => {
                    if (err) {
                        console.error('生産計画更新エラー:', err);
                        return req.db.rollback(() => {
                            res.status(500).json({
                                success: false,
                                message: 'データベースエラーが発生しました',
                                error: err.message
                            });
                        });
                    }

                    if (updateResult.affectedRows === 0) {
                        return req.db.rollback(() => {
                            res.status(404).json({
                                success: false,
                                message: '更新対象の生産計画が見つかりません'
                            });
                        });
                    }

                    // 予約更新処理：既存予約削除 → 新しい予約作成
                    reservationManager.updateReservations(
                        req.db,
                        planId,
                        product_code,
                        parseInt(planned_quantity),
                        newStatus,
                        'system',
                        (err, updateInfo) => {
                            if (err) {
                                console.error('予約更新エラー:', err);
                                return req.db.rollback(() => {
                                    res.status(500).json({
                                        success: false,
                                        message: '在庫予約の更新に失敗しました',
                                        error: err.message
                                    });
                                });
                            }

                            // トランザクションコミット
                            req.db.commit((err) => {
                                if (err) {
                                    console.error('トランザクションコミットエラー:', err);
                                    return req.db.rollback(() => {
                                        res.status(500).json({
                                            success: false,
                                            message: 'データベースエラーが発生しました',
                                            error: err.message
                                        });
                                    });
                                }

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
                                        reservation_update: updateInfo
                                    }
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

// ==========================================
// 5. 生産計画削除（自動予約解除機能付き）
// DELETE /api/plans/:id
// ==========================================
router.delete('/:id', (req, res) => {
    const planId = parseInt(req.params.id);

    if (isNaN(planId)) {
        return res.status(400).json({
            success: false,
            message: '無効な生産計画IDです'
        });
    }

    // 生産計画存在チェック
    const checkQuery = 'SELECT id, status, product_code, planned_quantity FROM production_plans WHERE id = ?';
    
    req.db.query(checkQuery, [planId], (err, results) => {
        if (err) {
            console.error('生産計画確認エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された生産計画が見つかりません'
            });
        }

        const plan = results[0];

        // 予約数確認
        const checkReservationQuery = 'SELECT COUNT(*) as reservation_count FROM inventory_reservations WHERE production_plan_id = ?';
        
        req.db.query(checkReservationQuery, [planId], (err, reservationResults) => {
            if (err) {
                console.error('予約確認エラー:', err);
                return res.status(500).json({
                    success: false,
                    message: 'データベースエラーが発生しました',
                    error: err.message
                });
            }

            const reservationCount = reservationResults[0].reservation_count;

            // 削除実行（CASCADE設定により関連予約も自動削除される）
            const deleteQuery = 'DELETE FROM production_plans WHERE id = ?';
            
            req.db.query(deleteQuery, [planId], (err, deleteResult) => {
                if (err) {
                    console.error('生産計画削除エラー:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'データベースエラーが発生しました',
                        error: err.message
                    });
                }

                if (deleteResult.affectedRows === 0) {
                    return res.status(404).json({
                        success: false,
                        message: '削除対象の生産計画が見つかりません'
                    });
                }

                res.json({
                    success: true,
                    message: `生産計画（ID: ${planId}）が正常に削除され、${reservationCount}件の在庫予約も自動解除されました`,
                    data: {
                        id: planId,
                        deleted_plan: plan,
                        deleted_reservations_count: reservationCount
                    }
                });
            });
        });
    });
});

// ==========================================
// 6. ステータス別生産計画取得
// GET /api/plans/status/:status
// ==========================================
router.get('/status/:status', (req, res) => {
    const status = req.params.status;
    const validStatuses = ['計画', '生産中', '完了', 'キャンセル'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            success: false,
            message: '無効なステータスです'
        });
    }

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

    req.db.query(query, [status], (err, results) => {
        if (err) {
            console.error('ステータス別生産計画取得エラー:', err);
            return res.status(500).json({
                success: false,
                message: 'データベースエラーが発生しました',
                error: err.message
            });
        }

        // 日付フォーマット調整
        const formattedResults = results.map(plan => ({
            ...plan,
            start_date: plan.start_date ? plan.start_date.toISOString().split('T')[0] : null,
            created_at: plan.created_at ? plan.created_at.toISOString() : null,
            updated_at: plan.updated_at ? plan.updated_at.toISOString() : null
        }));

        res.json({
            success: true,
            data: formattedResults,
            count: formattedResults.length,
            status: status
        });
    });
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