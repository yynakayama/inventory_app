// ==========================================
// 生産消費管理モジュール
// ファイル: src/routes/production-plans/production-consumption.js
// 目的: 生産開始時の部材消費処理（在庫減算）
// ==========================================

const express = require('express');
const router = express.Router();

// 認証ミドルウェアをインポート
const { requireProductionAccess } = require('../../middleware/auth');

/**
 * 生産開始時の部材消費処理
 * 生産計画に基づいて必要な部材を在庫から減算する
 * 
 * 【権限設計】
 * - 生産管理権限が必要
 */

// ==========================================
// 生産開始・部材消費処理
// POST /api/plans/:id/start-production
// ==========================================
router.post('/:id/start-production', requireProductionAccess, async (req, res) => {
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

        console.log(`[${new Date().toISOString()}] 🏭 生産開始・部材消費処理開始: 計画ID=${planId}, ユーザー=${req.user.username}`);

        connection = await req.mysql.createConnection(req.dbConfig);
        await connection.beginTransaction();

        // 1. 生産計画の存在チェック・ステータス確認
        const [planResults] = await connection.execute(
            `SELECT id, product_code, planned_quantity, start_date, status, created_by
             FROM production_plans 
             WHERE id = ?`,
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

        const planInfo = planResults[0];

        // ステータスチェック（計画状態の場合のみ生産開始可能）
        if (planInfo.status !== '計画') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `ステータス「${planInfo.status}」の生産計画は開始できません。「計画」ステータスの計画のみ開始可能です。`,
                error: 'INVALID_STATUS_FOR_START'
            });
        }

        console.log(`✅ 生産計画確認: ${planInfo.product_code} × ${planInfo.planned_quantity}個`);

        // 2. 必要な部材リストを取得
        const [requirements] = await connection.execute(
            `SELECT 
                part_code,
                required_quantity,
                current_stock,
                total_reserved_stock,
                available_stock,
                shortage_quantity
            FROM inventory_sufficiency_check 
            WHERE plan_id = ?
            ORDER BY part_code`,
            [planId]
        );

        if (requirements.length === 0) {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `製品「${planInfo.product_code}」のBOM（部品構成）が登録されていません`,
                error: 'NO_BOM_DATA'
            });
        }

        console.log(`📋 必要部材確認: ${requirements.length}種類の部材`);

        // 3. 在庫充足性チェック
        const shortagePartrs = requirements.filter(req => req.shortage_quantity > 0);
        
        if (shortagePartrs.length > 0) {
            await connection.rollback();
            
            const shortageDetails = shortagePartrs.map(part => 
                `${part.part_code}: 不足${part.shortage_quantity}個`
            ).join(', ');

            return res.status(400).json({
                success: false,
                message: `部材不足のため生産を開始できません。不足部材: ${shortageDetails}`,
                error: 'INSUFFICIENT_INVENTORY',
                shortage_details: shortagePartrs.map(part => ({
                    part_code: part.part_code,
                    required_quantity: part.required_quantity,
                    available_stock: part.available_stock,
                    shortage_quantity: part.shortage_quantity
                }))
            });
        }

        console.log(`✅ 在庫充足性確認: すべての部材が充足`);

        // 4. 部材消費処理（在庫減算）
        const consumptionResults = [];
        
        for (const requirement of requirements) {
            const { part_code, required_quantity } = requirement;
            
            // 現在の在庫数を取得
            const [stockResults] = await connection.execute(
                'SELECT current_stock FROM inventory WHERE part_code = ?',
                [part_code]
            );

            const currentStock = stockResults[0].current_stock;
            const newStock = currentStock - required_quantity;

            // 在庫減算実行
            await connection.execute(
                'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
                [newStock, part_code]
            );

            // 在庫履歴記録
            await connection.execute(
                `INSERT INTO inventory_transactions 
                (part_code, transaction_type, quantity, before_stock, after_stock, reference_id, reference_type, remarks, created_by) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    part_code,
                    '出庫',
                    -required_quantity,
                    currentStock,
                    newStock,
                    planId,
                    'production_plan',
                    `生産開始による部材消費 (計画ID: ${planId}, 製品: ${planInfo.product_code})`,
                    req.user.username
                ]
            );

            consumptionResults.push({
                part_code: part_code,
                consumed_quantity: required_quantity,
                stock_before: currentStock,
                stock_after: newStock
            });

            console.log(`📦 部材消費: ${part_code} ${required_quantity}個 (${currentStock} → ${newStock})`);
        }

        // 5. 生産計画のステータスを「生産中」に更新
        await connection.execute(
            'UPDATE production_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            ['生産中', planId]
        );

        // 6. 在庫予約をクリア（消費したので予約は不要）
        const { deleteReservations } = require('./reservation-manager');
        await deleteReservations(connection, planId);

        await connection.commit();

        console.log(`🎉 生産開始・部材消費完了: 計画ID=${planId}, 消費部材=${consumptionResults.length}種類`);
        
        res.json({
            success: true,
            message: `生産を開始しました。${consumptionResults.length}種類の部材を消費し、在庫から減算しました。`,
            data: {
                plan_id: planId,
                product_code: planInfo.product_code,
                planned_quantity: planInfo.planned_quantity,
                status_changed: '計画 → 生産中',
                consumption_summary: {
                    consumed_parts_count: consumptionResults.length,
                    total_consumed_items: consumptionResults.reduce((sum, item) => sum + item.consumed_quantity, 0)
                },
                consumption_details: consumptionResults,
                started_by: req.user.username,
                started_at: new Date().toISOString()
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
        
        console.error('❌ 生産開始・部材消費エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産開始処理中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 生産完了時の処理（オプション）
// POST /api/plans/:id/complete-production
// ==========================================
router.post('/:id/complete-production', requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const planId = parseInt(req.params.id);
        const { actual_quantity } = req.body; // 実際の生産数量
        
        if (isNaN(planId)) {
            return res.status(400).json({
                success: false,
                message: '無効な生産計画IDです',
                error: 'INVALID_PLAN_ID'
            });
        }

        console.log(`[${new Date().toISOString()}] ✅ 生産完了処理開始: 計画ID=${planId}, ユーザー=${req.user.username}`);

        connection = await req.mysql.createConnection(req.dbConfig);
        await connection.beginTransaction();

        // 生産計画の存在チェック・ステータス確認
        const [planResults] = await connection.execute(
            `SELECT id, product_code, planned_quantity, status
             FROM production_plans 
             WHERE id = ?`,
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

        const planInfo = planResults[0];

        if (planInfo.status !== '生産中') {
            await connection.rollback();
            return res.status(400).json({
                success: false,
                message: `ステータス「${planInfo.status}」の生産計画は完了処理できません`,
                error: 'INVALID_STATUS_FOR_COMPLETE'
            });
        }

        // 実際の生産数量の記録（オプション機能として）
        const finalQuantity = actual_quantity || planInfo.planned_quantity;

        // 生産計画のステータスを「完了」に更新
        await connection.execute(
            `UPDATE production_plans SET 
                status = ?, 
                planned_quantity = ?,
                updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            ['完了', finalQuantity, planId]
        );

        await connection.commit();

        console.log(`🎉 生産完了処理完了: 計画ID=${planId}, 完了数量=${finalQuantity}`);
        
        res.json({
            success: true,
            message: `生産が完了しました。`,
            data: {
                plan_id: planId,
                product_code: planInfo.product_code,
                final_quantity: finalQuantity,
                status_changed: '生産中 → 完了',
                completed_by: req.user.username,
                completed_at: new Date().toISOString()
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
        
        console.error('❌ 生産完了処理エラー:', error);
        res.status(500).json({
            success: false,
            message: '生産完了処理中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;