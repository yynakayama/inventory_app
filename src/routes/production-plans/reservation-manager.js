// ==========================================
// 在庫予約管理モジュール
// ファイル: src/routes/production-plans/reservation-manager.js
// 目的: 在庫予約の作成・更新・削除を専門に扱うモジュール
// ==========================================

/**
 * 在庫予約の作成・更新・削除を専門に扱うモジュール
 * 生産計画とBOMを連携させて、必要部品の在庫予約を自動化
 * 
 * 【修正内容】
 * - mysql2/promise方式に統一
 * - 全ての関数をasync/awaitに変更
 * - エラーハンドリングの強化
 */

// ==========================================
// 1. 在庫予約作成
// 生産計画登録時に呼び出される関数
// ==========================================

/**
 * 生産計画に基づいて在庫予約を作成
 * @param {Object} connection - データベース接続（単一接続）
 * @param {number} planId - 生産計画ID
 * @param {string} productCode - 製品コード
 * @param {number} plannedQuantity - 生産数量
 * @param {string} createdBy - 作成者
 * @returns {Array} 作成された予約のリスト
 */
async function createReservations(connection, planId, productCode, plannedQuantity, createdBy) {
    console.log(`🔄 在庫予約作成開始: 計画ID=${planId}, 製品=${productCode}, 数量=${plannedQuantity}`);
    
    try {
        // BOM展開で必要部品と数量を取得
        const [bomResults] = await connection.execute(
            `SELECT 
                b.part_code,
                b.quantity as unit_quantity,
                (b.quantity * ?) as required_quantity,
                p.specification as part_specification
            FROM bom_items b
            INNER JOIN parts p ON b.part_code = p.part_code
            WHERE b.product_code = ? 
            AND b.is_active = TRUE 
            AND p.is_active = TRUE
            ORDER BY b.part_code`,
            [plannedQuantity, productCode]
        );
        
        if (bomResults.length === 0) {
            // BOM未設定の場合は予約なしで正常終了
            console.log(`⚠️ BOM未設定: 製品「${productCode}」の部品構成が登録されていません`);
            return [];
        }
        
        console.log(`📋 BOM展開結果: ${bomResults.length}種類の部品が必要`);
        
        // 部品別に予約を作成
        const reservationResults = [];
        
        for (const bomItem of bomResults) {
            const remarks = `生産計画ID:${planId} 製品:${productCode} での自動予約`;
            
            const [result] = await connection.execute(
                `INSERT INTO inventory_reservations (
                    production_plan_id,
                    part_code,
                    reserved_quantity,
                    reservation_date,
                    remarks,
                    created_by
                ) VALUES (?, ?, ?, NOW(), ?, ?)`,
                [
                    planId,
                    bomItem.part_code,
                    bomItem.required_quantity,
                    remarks,
                    createdBy
                ]
            );
            
            // 予約結果を記録
            reservationResults.push({
                reservation_id: result.insertId,
                part_code: bomItem.part_code,
                part_specification: bomItem.part_specification,
                unit_quantity: bomItem.unit_quantity,
                reserved_quantity: bomItem.required_quantity,
                created_at: new Date().toISOString()
            });
            
            console.log(`✅ 予約作成完了 (${reservationResults.length}/${bomResults.length}): ${bomItem.part_code} → ${bomItem.required_quantity}個`);
        }
        
        console.log(`🎉 在庫予約作成完了: ${reservationResults.length}件の予約を作成しました`);
        return reservationResults;
        
    } catch (error) {
        console.error('❌ 在庫予約作成エラー:', error);
        throw error;
    }
}

// ==========================================
// 2. 在庫予約削除
// 生産計画削除時や予約更新時に呼び出される関数
// ==========================================

/**
 * 指定された生産計画の全在庫予約を削除
 * @param {Object} connection - データベース接続（単一接続）
 * @param {number} planId - 生産計画ID
 * @returns {Object} 削除情報
 */
async function deleteReservations(connection, planId) {
    console.log(`🗑️ 在庫予約削除開始: 計画ID=${planId}`);
    
    try {
        // 削除前に予約詳細を取得（ログ用）
        const [reservations] = await connection.execute(
            `SELECT 
                ir.id,
                ir.part_code,
                ir.reserved_quantity,
                p.specification as part_specification
            FROM inventory_reservations ir
            INNER JOIN parts p ON ir.part_code = p.part_code
            WHERE ir.production_plan_id = ?
            ORDER BY ir.part_code`,
            [planId]
        );
        
        if (reservations.length === 0) {
            console.log(`ℹ️ 削除対象なし: 計画ID=${planId}の予約は存在しません`);
            return {
                deleted_count: 0,
                deleted_reservations: [],
                message: '削除対象の予約がありませんでした'
            };
        }
        
        console.log(`📋 削除対象: ${reservations.length}件の予約`);
        
        // 予約削除実行
        const [result] = await connection.execute(
            'DELETE FROM inventory_reservations WHERE production_plan_id = ?',
            [planId]
        );
        
        console.log(`✅ 在庫予約削除完了: ${result.affectedRows}件の予約を削除しました`);
        
        return {
            deleted_count: result.affectedRows,
            deleted_reservations: reservations,
            message: `${result.affectedRows}件の予約を削除しました`
        };
        
    } catch (error) {
        console.error('❌ 在庫予約削除エラー:', error);
        throw error;
    }
}

// ==========================================
// 3. 在庫予約更新
// 生産計画更新時に呼び出される関数（削除→作成の組み合わせ）
// ==========================================

/**
 * 在庫予約を更新（既存予約削除 → 新しい予約作成）
 * @param {Object} connection - データベース接続（単一接続）
 * @param {number} planId - 生産計画ID
 * @param {string} productCode - 製品コード
 * @param {number} plannedQuantity - 新しい生産数量
 * @param {string} status - 新しいステータス
 * @param {string} updatedBy - 更新者
 * @returns {Object} 更新情報
 */
async function updateReservations(connection, planId, productCode, plannedQuantity, status, updatedBy) {
    console.log(`🔄 在庫予約更新開始: 計画ID=${planId}, 製品=${productCode}, 数量=${plannedQuantity}, ステータス=${status}`);
    
    try {
        // 1. 既存予約を削除
        const deleteResult = await deleteReservations(connection, planId);
        
        // 2. 新しいステータスが計画・生産中の場合は新しい予約を作成
        if (status === '計画' || status === '生産中') {
            console.log(`📝 新しい予約作成: ステータス「${status}」のため予約を作成します`);
            
            const createResult = await createReservations(connection, planId, productCode, plannedQuantity, updatedBy);
            
            console.log(`🎉 在庫予約更新完了: 削除${deleteResult.deleted_count}件 → 作成${createResult.length}件`);
            
            return {
                action: 'update_with_new_reservations',
                deleted: deleteResult,
                created: createResult,
                message: `生産計画が更新され、在庫予約も更新されました（削除:${deleteResult.deleted_count}件、作成:${createResult.length}件）`
            };
        } else {
            // 完了・キャンセルステータスの場合は予約削除のみ
            console.log(`🚫 予約削除のみ: ステータス「${status}」のため新しい予約は作成しません`);
            
            return {
                action: 'delete_only',
                deleted: deleteResult,
                created: [],
                message: `生産計画が更新され、在庫予約は解除されました（削除:${deleteResult.deleted_count}件）`
            };
        }
        
    } catch (error) {
        console.error('❌ 在庫予約更新エラー:', error);
        throw error;
    }
}

// ==========================================
// 4. 在庫予約状況確認
// デバッグ・監視用の関数
// ==========================================

/**
 * 指定された生産計画の在庫予約状況を取得
 * @param {Object} connection - データベース接続（単一接続またはプール）
 * @param {number} planId - 生産計画ID
 * @returns {Object} 予約状況
 */
async function getReservationStatus(connection, planId) {
    try {
        const [results] = await connection.execute(
            `SELECT 
                ir.id,
                ir.part_code,
                ir.reserved_quantity,
                ir.reservation_date,
                ir.remarks,
                ir.created_by,
                p.specification as part_specification,
                p.supplier,
                i.current_stock
            FROM inventory_reservations ir
            INNER JOIN parts p ON ir.part_code = p.part_code
            LEFT JOIN inventory i ON ir.part_code = i.part_code
            WHERE ir.production_plan_id = ?
            ORDER BY ir.part_code`,
            [planId]
        );
        
        // 統計情報を計算
        const totalReservations = results.length;
        const totalQuantity = results.reduce((sum, item) => sum + item.reserved_quantity, 0);
        
        const status = {
            plan_id: planId,
            reservations: results,
            summary: {
                total_parts: totalReservations,
                total_reserved_quantity: totalQuantity,
                check_date: new Date().toISOString()
            }
        };
        
        return status;
        
    } catch (error) {
        console.error('❌ 予約状況取得エラー:', error);
        throw error;
    }
}

// ==========================================
// 5. 在庫予約の整合性チェック
// システム監視・メンテナンス用の関数
// ==========================================

/**
 * 在庫予約と生産計画の整合性をチェック
 * @param {Object} connection - データベース接続
 * @returns {Object} 整合性チェック結果
 */
async function validateReservationIntegrity(connection) {
    try {
        console.log('🔍 在庫予約整合性チェック開始');
        
        // 1. 孤立した予約（対応する生産計画がない）をチェック
        const [orphanedReservations] = await connection.execute(
            `SELECT 
                ir.id,
                ir.production_plan_id,
                ir.part_code,
                ir.reserved_quantity
            FROM inventory_reservations ir
            LEFT JOIN production_plans pp ON ir.production_plan_id = pp.id
            WHERE pp.id IS NULL`
        );
        
        // 2. ステータスと予約の不整合をチェック
        const [statusMismatches] = await connection.execute(
            `SELECT 
                pp.id as plan_id,
                pp.status,
                COUNT(ir.id) as reservation_count
            FROM production_plans pp
            LEFT JOIN inventory_reservations ir ON pp.id = ir.production_plan_id
            WHERE pp.status IN ('完了', 'キャンセル') AND ir.id IS NOT NULL
            GROUP BY pp.id, pp.status`
        );
        
        const integrityReport = {
            check_date: new Date().toISOString(),
            orphaned_reservations: {
                count: orphanedReservations.length,
                reservations: orphanedReservations
            },
            status_mismatches: {
                count: statusMismatches.length,
                mismatches: statusMismatches
            },
            overall_status: orphanedReservations.length === 0 && statusMismatches.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND'
        };
        
        console.log(`✅ 整合性チェック完了: 孤立予約=${orphanedReservations.length}件, ステータス不整合=${statusMismatches.length}件`);
        
        return integrityReport;
        
    } catch (error) {
        console.error('❌ 整合性チェックエラー:', error);
        throw error;
    }
}

// ==========================================
// モジュールエクスポート
// ==========================================
module.exports = {
    createReservations,
    deleteReservations,
    updateReservations,
    getReservationStatus,
    validateReservationIntegrity
};