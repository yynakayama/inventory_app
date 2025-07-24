// ==========================================
// 在庫予約管理モジュール
// File: routes/production-plans/reservation-manager.js
// ==========================================

/**
 * 在庫予約の作成・更新・削除を専門に扱うモジュール
 * 生産計画とBOMを連携させて、必要部品の在庫予約を自動化
 */

// ==========================================
// 1. 在庫予約作成
// 生産計画登録時に呼び出される関数
// ==========================================

/**
 * 生産計画に基づいて在庫予約を作成
 * @param {Object} db - データベース接続
 * @param {number} planId - 生産計画ID
 * @param {string} productCode - 製品コード
 * @param {number} plannedQuantity - 生産数量
 * @param {string} createdBy - 作成者
 * @param {Function} callback - コールバック関数 (err, reservations)
 */
function createReservations(db, planId, productCode, plannedQuantity, createdBy, callback) {
    console.log(`🔄 在庫予約作成開始: 計画ID=${planId}, 製品=${productCode}, 数量=${plannedQuantity}`);
    
    // BOM展開で必要部品と数量を取得
    const bomQuery = `
        SELECT 
            b.part_code,
            b.quantity as unit_quantity,
            (b.quantity * ?) as required_quantity,
            p.specification as part_specification
        FROM bom_items b
        INNER JOIN parts p ON b.part_code = p.part_code
        WHERE b.product_code = ? 
        AND b.is_active = TRUE 
        AND p.is_active = TRUE
        ORDER BY b.part_code
    `;
    
    db.query(bomQuery, [plannedQuantity, productCode], (err, bomResults) => {
        if (err) {
            console.error('❌ BOM展開エラー:', err);
            return callback(err);
        }
        
        if (bomResults.length === 0) {
            // BOM未設定の場合は予約なしで正常終了
            console.log(`⚠️ BOM未設定: 製品「${productCode}」の部品構成が登録されていません`);
            return callback(null, []);
        }
        
        console.log(`📋 BOM展開結果: ${bomResults.length}種類の部品が必要`);
        
        // 部品別に予約を作成
        let completedReservations = 0;
        const reservationResults = [];
        let hasError = false;
        
        bomResults.forEach((bomItem, index) => {
            if (hasError) return; // エラー発生時は処理停止
            
            const reservationQuery = `
                INSERT INTO inventory_reservations (
                    production_plan_id,
                    part_code,
                    reserved_quantity,
                    reservation_date,
                    remarks,
                    created_by
                ) VALUES (?, ?, ?, NOW(), ?, ?)
            `;
            
            const remarks = `生産計画ID:${planId} 製品:${productCode} での自動予約`;
            
            db.query(reservationQuery, [
                planId,
                bomItem.part_code,
                bomItem.required_quantity,
                remarks,
                createdBy
            ], (err, result) => {
                if (err) {
                    console.error(`❌ 予約作成エラー (部品:${bomItem.part_code}):`, err);
                    hasError = true;
                    return callback(err);
                }
                
                // 予約結果を記録
                reservationResults.push({
                    reservation_id: result.insertId,
                    part_code: bomItem.part_code,
                    part_specification: bomItem.part_specification,
                    unit_quantity: bomItem.unit_quantity,
                    reserved_quantity: bomItem.required_quantity,
                    created_at: new Date().toISOString()
                });
                
                completedReservations++;
                console.log(`✅ 予約作成完了 (${completedReservations}/${bomResults.length}): ${bomItem.part_code} → ${bomItem.required_quantity}個`);
                
                // 全ての予約が完了したらコールバック実行
                if (completedReservations === bomResults.length) {
                    console.log(`🎉 在庫予約作成完了: ${reservationResults.length}件の予約を作成しました`);
                    callback(null, reservationResults);
                }
            });
        });
    });
}

// ==========================================
// 2. 在庫予約削除
// 生産計画削除時や予約更新時に呼び出される関数
// ==========================================

/**
 * 指定された生産計画の全在庫予約を削除
 * @param {Object} db - データベース接続
 * @param {number} planId - 生産計画ID
 * @param {Function} callback - コールバック関数 (err, deleteInfo)
 */
function deleteReservations(db, planId, callback) {
    console.log(`🗑️ 在庫予約削除開始: 計画ID=${planId}`);
    
    // 削除前に予約詳細を取得（ログ用）
    const selectQuery = `
        SELECT 
            ir.id,
            ir.part_code,
            ir.reserved_quantity,
            p.specification as part_specification
        FROM inventory_reservations ir
        INNER JOIN parts p ON ir.part_code = p.part_code
        WHERE ir.production_plan_id = ?
        ORDER BY ir.part_code
    `;
    
    db.query(selectQuery, [planId], (err, reservations) => {
        if (err) {
            console.error('❌ 削除対象予約取得エラー:', err);
            return callback(err);
        }
        
        if (reservations.length === 0) {
            console.log(`ℹ️ 削除対象なし: 計画ID=${planId}の予約は存在しません`);
            return callback(null, {
                deleted_count: 0,
                deleted_reservations: [],
                message: '削除対象の予約がありませんでした'
            });
        }
        
        console.log(`📋 削除対象: ${reservations.length}件の予約`);
        
        // 予約削除実行
        const deleteQuery = 'DELETE FROM inventory_reservations WHERE production_plan_id = ?';
        
        db.query(deleteQuery, [planId], (err, result) => {
            if (err) {
                console.error('❌ 予約削除エラー:', err);
                return callback(err);
            }
            
            console.log(`✅ 在庫予約削除完了: ${result.affectedRows}件の予約を削除しました`);
            
            callback(null, {
                deleted_count: result.affectedRows,
                deleted_reservations: reservations,
                message: `${result.affectedRows}件の予約を削除しました`
            });
        });
    });
}

// ==========================================
// 3. 在庫予約更新
// 生産計画更新時に呼び出される関数（削除→作成の組み合わせ）
// ==========================================

/**
 * 在庫予約を更新（既存予約削除 → 新しい予約作成）
 * @param {Object} db - データベース接続
 * @param {number} planId - 生産計画ID
 * @param {string} productCode - 製品コード
 * @param {number} plannedQuantity - 新しい生産数量
 * @param {string} status - 新しいステータス
 * @param {string} updatedBy - 更新者
 * @param {Function} callback - コールバック関数 (err, updateInfo)
 */
function updateReservations(db, planId, productCode, plannedQuantity, status, updatedBy, callback) {
    console.log(`🔄 在庫予約更新開始: 計画ID=${planId}, 製品=${productCode}, 数量=${plannedQuantity}, ステータス=${status}`);
    
    // 1. 既存予約を削除
    deleteReservations(db, planId, (err, deleteResult) => {
        if (err) {
            console.error('❌ 既存予約削除エラー:', err);
            return callback(err);
        }
        
        // 2. 新しいステータスが計画・生産中の場合は新しい予約を作成
        if (status === '計画' || status === '生産中') {
            console.log(`📝 新しい予約作成: ステータス「${status}」のため予約を作成します`);
            
            createReservations(db, planId, productCode, plannedQuantity, updatedBy, (err, createResult) => {
                if (err) {
                    console.error('❌ 新規予約作成エラー:', err);
                    return callback(err);
                }
                
                console.log(`🎉 在庫予約更新完了: 削除${deleteResult.deleted_count}件 → 作成${createResult.length}件`);
                
                callback(null, {
                    action: 'update_with_new_reservations',
                    deleted: deleteResult,
                    created: createResult,
                    message: `生産計画が更新され、在庫予約も更新されました（削除:${deleteResult.deleted_count}件、作成:${createResult.length}件）`
                });
            });
        } else {
            // 完了・キャンセルステータスの場合は予約削除のみ
            console.log(`🚫 予約削除のみ: ステータス「${status}」のため新しい予約は作成しません`);
            
            callback(null, {
                action: 'delete_only',
                deleted: deleteResult,
                created: [],
                message: `生産計画が更新され、在庫予約は解除されました（削除:${deleteResult.deleted_count}件）`
            });
        }
    });
}

// ==========================================
// 4. 在庫予約状況確認
// デバッグ・監視用の関数
// ==========================================

/**
 * 指定された生産計画の在庫予約状況を取得
 * @param {Object} db - データベース接続
 * @param {number} planId - 生産計画ID
 * @param {Function} callback - コールバック関数 (err, reservationStatus)
 */
function getReservationStatus(db, planId, callback) {
    const query = `
        SELECT 
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
        ORDER BY ir.part_code
    `;
    
    db.query(query, [planId], (err, results) => {
        if (err) {
            console.error('❌ 予約状況取得エラー:', err);
            return callback(err);
        }
        
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
        
        callback(null, status);
    });
}

// ==========================================
// モジュールエクスポート
// ==========================================
module.exports = {
    createReservations,
    deleteReservations,
    updateReservations,
    getReservationStatus
};