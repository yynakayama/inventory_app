// ==========================================
// 棚おろし管理API
// ファイル: routes/stocktaking.js
// 目的: 在庫の実地調査と帳簿在庫との差異処理
// ==========================================

const express = require('express');
const router = express.Router();

// 🏷️ 固定の差異理由コード
const REASON_CODES = {
    '盗難': '盗難',
    '破損': '破損', 
    '計数ミス': '計数ミス',
    'その他': 'その他'
};

// ==========================================
// 1. 棚おろし対象部品一覧取得
// GET /api/stocktaking/parts
// 目的: 棚おろし実施可能な部品リストを取得
// ==========================================
router.get('/parts', (req, res) => {
    console.log('🔍 棚おろし対象部品一覧を取得中...');
    
    const query = `
        SELECT 
            p.part_code,
            p.specification,
            p.category,
            p.supplier,
            COALESCE(i.current_stock, 0) as current_stock,
            p.unit
        FROM parts p
            LEFT JOIN inventory i ON p.part_code = i.part_code
        WHERE p.is_active = TRUE
        ORDER BY p.category, p.part_code
    `;
    
    req.db.query(query, (err, results) => {
        if (err) {
            console.error('❌ 棚おろし対象部品取得エラー:', err);
            return res.status(500).json({ 
                error: 'サーバーエラーが発生しました',
                details: err.message 
            });
        }
        
        console.log(`✅ 棚おろし対象部品 ${results.length} 件を取得`);
        res.json({
            parts: results,
            total_count: results.length
        });
    });
});

// ==========================================
// 2. 棚おろし実施 - 差異計算
// POST /api/stocktaking/execute
// 目的: 実地数量を入力して差異を計算・記録
// ==========================================
router.post('/execute', (req, res) => {
    const { stocktaking_items, stocktaking_date } = req.body;
    
    // バリデーション
    if (!stocktaking_items || !Array.isArray(stocktaking_items) || stocktaking_items.length === 0) {
        return res.status(400).json({ 
            error: '棚おろし対象が指定されていません' 
        });
    }
    
    // 棚おろし日付のデフォルト設定
    const targetDate = stocktaking_date || new Date().toISOString().split('T')[0];
    
    console.log(`🏭 棚おろし実施開始 - 対象: ${stocktaking_items.length} 件, 日付: ${targetDate}`);
    
    // コネクションプールからコネクションを取得してトランザクション開始
    req.db.getConnection((err, connection) => {
        if (err) {
            console.error('❌ コネクション取得エラー:', err);
            return res.status(500).json({ error: 'データベース接続に失敗しました' });
        }
        
        // トランザクション開始
        connection.beginTransaction((err) => {
            if (err) {
                connection.release();
                console.error('❌ トランザクション開始エラー:', err);
                return res.status(500).json({ error: 'トランザクション開始に失敗しました' });
            }
            
            executeStocktaking(connection, stocktaking_items, targetDate, (err, results) => {
                if (err) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error('❌ 棚おろし実施エラー:', err);
                        res.status(500).json({ 
                            error: '棚おろし実施に失敗しました',
                            details: err.message 
                        });
                    });
                }
                
                // トランザクションコミット
                connection.commit((err) => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error('❌ コミットエラー:', err);
                            res.status(500).json({ error: 'データ保存に失敗しました' });
                        });
                    }
                    
                    connection.release(); // コネクションを解放
                    console.log('✅ 棚おろし実施完了');
                    res.json({
                        message: '棚おろしが正常に完了しました',
                        processed_count: results.processed_count,
                        difference_count: results.difference_count,
                        stocktaking_date: targetDate,
                        results: results.stocktaking_records
                    });
                });
            });
        });
    });
});

// ==========================================
// 3. 棚おろし履歴取得
// GET /api/stocktaking/history
// 目的: 過去の棚おろし実施履歴を取得
// ==========================================
router.get('/history', (req, res) => {
    const { part_code, start_date, end_date, limit = 50 } = req.query;
    
    console.log('📚 棚おろし履歴を取得中...');
    
    let query = `
        SELECT 
            s.id,
            s.stocktaking_date,
            s.part_code,
            p.specification,
            s.book_quantity,
            s.actual_quantity,
            s.difference,
            s.reason_code,
            s.remarks,
            s.created_at
        FROM stocktaking s
            INNER JOIN parts p ON s.part_code = p.part_code
        WHERE 1=1
    `;
    
    const params = [];
    
    // 部品コード指定
    if (part_code) {
        query += ' AND s.part_code = ?';
        params.push(part_code);
    }
    
    // 日付範囲指定
    if (start_date) {
        query += ' AND s.stocktaking_date >= ?';
        params.push(start_date);
    }
    
    if (end_date) {
        query += ' AND s.stocktaking_date <= ?';
        params.push(end_date);
    }
    
    query += ' ORDER BY s.stocktaking_date DESC, s.part_code LIMIT ?';
    params.push(parseInt(limit));
    
    req.db.query(query, params, (err, results) => {
        if (err) {
            console.error('❌ 棚おろし履歴取得エラー:', err);
            return res.status(500).json({ 
                error: 'サーバーエラーが発生しました',
                details: err.message 
            });
        }
        
        console.log(`✅ 棚おろし履歴 ${results.length} 件を取得`);
        res.json({
            history: results,
            count: results.length
        });
    });
});

// ==========================================
// 4. 差異理由コード一覧取得
// GET /api/stocktaking/reason-codes
// 目的: 差異理由の選択肢を取得
// ==========================================
router.get('/reason-codes', (req, res) => {
    console.log('📝 差異理由コード一覧を取得');
    
    res.json({
        reason_codes: Object.keys(REASON_CODES).map(code => ({
            code: code,
            name: REASON_CODES[code]
        }))
    });
});

// ==========================================
// 内部関数: 棚おろし実施処理
// 引数: connection (個別のMySQLコネクション)
// ==========================================
function executeStocktaking(connection, stocktaking_items, stocktaking_date, callback) {
    let processed_count = 0;
    let difference_count = 0;
    const stocktaking_records = [];
    
    // 各部品の棚おろし処理を順次実行
    function processNextItem(index) {
        if (index >= stocktaking_items.length) {
            // 全ての処理が完了
            return callback(null, {
                processed_count,
                difference_count,
                stocktaking_records
            });
        }
        
        const item = stocktaking_items[index];
        const { part_code, actual_quantity, reason_code, remarks } = item;
        
        // バリデーション
        if (!part_code || actual_quantity < 0) {
            return callback(new Error(`無効なデータです: ${JSON.stringify(item)}`));
        }
        
        if (reason_code && !REASON_CODES[reason_code]) {
            return callback(new Error(`無効な理由コードです: ${reason_code}`));
        }
        
        console.log(`🔢 棚おろし処理中: ${part_code} (実地数量: ${actual_quantity})`);
        
        // 現在の帳簿在庫を取得
        const getInventoryQuery = `
            SELECT 
                COALESCE(current_stock, 0) as current_stock
            FROM inventory 
            WHERE part_code = ?
        `;
        
        connection.query(getInventoryQuery, [part_code], (err, results) => {
            if (err) {
                return callback(err);
            }
            
            // 帳簿在庫（在庫レコードが存在しない場合は0とする）
            const book_quantity = results.length > 0 ? results[0].current_stock : 0;
            const difference = actual_quantity - book_quantity;
            
            // 差異がある場合のカウント
            if (difference !== 0) {
                difference_count++;
            }
            
            console.log(`  📊 ${part_code}: 帳簿${book_quantity} → 実地${actual_quantity} (差異: ${difference})`);
            
            // 棚おろし記録を保存
            const insertStocktakingQuery = `
                INSERT INTO stocktaking (
                    stocktaking_date, part_code, book_quantity, 
                    actual_quantity, difference, reason_code, remarks
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            
            const stocktakingParams = [
                stocktaking_date, part_code, book_quantity,
                actual_quantity, difference, reason_code || null, remarks || null
            ];
            
            connection.query(insertStocktakingQuery, stocktakingParams, (err, stocktakingResult) => {
                if (err) {
                    return callback(err);
                }
                
                // 在庫数量を実地数量に更新
                updateInventoryStock(connection, part_code, actual_quantity, difference, stocktakingResult.insertId, (err) => {
                    if (err) {
                        return callback(err);
                    }
                    
                    processed_count++;
                    stocktaking_records.push({
                        part_code,
                        book_quantity,
                        actual_quantity,
                        difference,
                        reason_code,
                        remarks
                    });
                    
                    // 次の部品を処理
                    processNextItem(index + 1);
                });
            });
        });
    }
    
    // 最初の部品から処理開始
    processNextItem(0);
}

// ==========================================
// 内部関数: 在庫数量更新処理
// 引数: connection (個別のMySQLコネクション)
// ==========================================
function updateInventoryStock(connection, part_code, new_stock, difference, stocktaking_id, callback) {
    // 在庫レコードの存在確認・作成
    const upsertInventoryQuery = `
        INSERT INTO inventory (part_code, current_stock, reserved_stock, safety_stock)
        VALUES (?, ?, 0, 0)
        ON DUPLICATE KEY UPDATE 
            current_stock = ?
    `;
    
    connection.query(upsertInventoryQuery, [part_code, new_stock, new_stock], (err) => {
        if (err) {
            return callback(err);
        }
        
        // 差異がある場合のみトランザクション履歴を記録
        if (difference !== 0) {
            const insertTransactionQuery = `
                INSERT INTO inventory_transactions (
                    part_code, transaction_type, quantity, 
                    before_stock, after_stock, reference_id, reference_type,
                    transaction_date, remarks, created_by
                ) VALUES (?, '棚おろし修正', ?, ?, ?, ?, 'stocktaking', NOW(), ?, 'system')
            `;
            
            const before_stock = new_stock - difference;
            const transactionParams = [
                part_code, difference, before_stock, new_stock, 
                stocktaking_id, `棚おろしによる在庫修正 (差異: ${difference})`
            ];
            
            connection.query(insertTransactionQuery, transactionParams, (err) => {
                if (err) {
                    return callback(err);
                }
                
                console.log(`  💾 在庫更新完了: ${part_code} → ${new_stock}`);
                callback(null);
            });
        } else {
            console.log(`  ✅ 差異なし: ${part_code}`);
            callback(null);
        }
    });
}

module.exports = router;