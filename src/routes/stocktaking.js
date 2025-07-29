// ==========================================
// 棚おろし管理API
// ファイル: src/routes/stocktaking.js
// 目的: 在庫の実地調査と帳簿在庫との差異処理
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireMaterialAccess, requireReadAccess } = require('../middleware/auth');

const router = express.Router();

// データベース接続設定
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'inventory_db',
    charset: 'utf8mb4'
};

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
// 権限: 全ユーザー（認証必須）
// 目的: 棚おろし実施可能な部品リストを取得
// ==========================================
router.get('/parts', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        console.log(`[${new Date().toISOString()}] 🔍 棚おろし対象部品一覧取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
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
        
        const [results] = await connection.execute(query);
        
        console.log(`✅ 棚おろし対象部品 ${results.length} 件を取得完了`);
        
        res.json({
            success: true,
            data: {
                parts: results,
                total_count: results.length
            },
            message: `棚おろし対象部品を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 棚おろし対象部品取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '棚おろし対象部品の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 棚おろし実施 - 差異計算・在庫更新
// POST /api/stocktaking/execute
// 権限: 資材管理権限（在庫数量を変更する重要操作）
// 目的: 実地数量を入力して差異を計算・記録・在庫更新
// ==========================================
router.post('/execute', authenticateToken, requireMaterialAccess, async (req, res) => {
    let connection;
    
    try {
        const { stocktaking_items, stocktaking_date } = req.body;
        
        // バリデーション
        if (!stocktaking_items || !Array.isArray(stocktaking_items) || stocktaking_items.length === 0) {
            return res.status(400).json({
                success: false,
                message: '棚おろし対象が指定されていません',
                error: 'INVALID_INPUT'
            });
        }
        
        // 棚おろし日付のデフォルト設定
        const targetDate = stocktaking_date || new Date().toISOString().split('T')[0];
        
        console.log(`[${new Date().toISOString()}] 🏭 棚おろし実施開始: ユーザー=${req.user.username}, 対象=${stocktaking_items.length}件, 日付=${targetDate}`);
        
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();
        
        const results = await executeStocktaking(connection, stocktaking_items, targetDate, req.user.username);
        
        await connection.commit();
        
        console.log(`✅ 棚おろし実施完了: 処理=${results.processed_count}件, 差異=${results.difference_count}件`);
        
        res.json({
            success: true,
            data: {
                processed_count: results.processed_count,
                difference_count: results.difference_count,
                stocktaking_date: targetDate,
                results: results.stocktaking_records
            },
            message: `棚おろしが正常に完了しました（処理: ${results.processed_count}件、差異: ${results.difference_count}件）`
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                console.log('🔄 トランザクションをロールバックしました');
            } catch (rollbackError) {
                console.error('❌ ロールバックエラー:', rollbackError);
            }
        }
        
        console.error('❌ 棚おろし実施エラー:', error);
        res.status(500).json({
            success: false,
            message: '棚おろし実施中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. 棚おろし履歴取得
// GET /api/stocktaking/history
// 権限: 全ユーザー（認証必須）
// 目的: 過去の棚おろし実施履歴を取得
// ==========================================
router.get('/history', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { part_code, start_date, end_date, limit = '50' } = req.query;
        
        console.log(`[${new Date().toISOString()}] 📚 棚おろし履歴取得開始: ユーザー=${req.user.username}`);
        
        connection = await mysql.createConnection(dbConfig);
        
        let query = `
            SELECT 
                s.id,
                s.stocktaking_date,
                s.part_code,
                p.specification,
                p.category,
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
        if (part_code && part_code.trim()) {
            query += ' AND s.part_code = ?';
            params.push(part_code.trim());
        }
        
        // 日付範囲指定
        if (start_date && start_date.trim()) {
            query += ' AND s.stocktaking_date >= ?';
            params.push(start_date.trim());
        }
        
        if (end_date && end_date.trim()) {
            query += ' AND s.stocktaking_date <= ?';
            params.push(end_date.trim());
        }
        
        query += ' ORDER BY s.stocktaking_date DESC, s.part_code';
        
        // LIMIT句は動的パラメータを避けて直接埋め込み
        const limitNum = parseInt(limit) || 50;
        if (limitNum > 0 && limitNum <= 1000) {
            query += ` LIMIT ${limitNum}`;
        } else {
            query += ' LIMIT 50';
        }
        
        const [results] = await connection.execute(query, params);
        
        console.log(`✅ 棚おろし履歴 ${results.length} 件を取得完了`);
        
        res.json({
            success: true,
            data: {
                history: results,
                count: results.length,
                filters: {
                    part_code: part_code || null,
                    start_date: start_date || null,
                    end_date: end_date || null,
                    limit: limitNum
                }
            },
            message: `棚おろし履歴を${results.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 棚おろし履歴取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '棚おろし履歴の取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 4. 差異理由コード一覧取得
// GET /api/stocktaking/reason-codes
// 権限: 全ユーザー（認証必須）
// 目的: 差異理由の選択肢を取得
// ==========================================
router.get('/reason-codes', authenticateToken, requireReadAccess, async (req, res) => {
    try {
        console.log(`[${new Date().toISOString()}] 📝 差異理由コード一覧取得: ユーザー=${req.user.username}`);
        
        const reason_codes = Object.keys(REASON_CODES).map(code => ({
            code: code,
            name: REASON_CODES[code]
        }));
        
        res.json({
            success: true,
            data: {
                reason_codes: reason_codes,
                count: reason_codes.length
            },
            message: `差異理由コードを${reason_codes.length}件取得しました`
        });

    } catch (error) {
        console.error('❌ 差異理由コード取得エラー:', error);
        res.status(500).json({
            success: false,
            message: '差異理由コードの取得中にエラーが発生しました',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ==========================================
// 内部関数: 棚おろし実施処理
// 目的: 複数部品の棚おろしを順次処理（トランザクション内）
// ==========================================
async function executeStocktaking(connection, stocktaking_items, stocktaking_date, username) {
    let processed_count = 0;
    let difference_count = 0;
    const stocktaking_records = [];
    
    for (const item of stocktaking_items) {
        const { part_code, actual_quantity, reason_code, remarks } = item;
        
        // バリデーション
        if (!part_code || part_code.trim() === '') {
            throw new Error(`部品コードが指定されていません: ${JSON.stringify(item)}`);
        }
        
        if (actual_quantity < 0 || !Number.isInteger(actual_quantity)) {
            throw new Error(`実地数量が無効です: ${part_code} (${actual_quantity})`);
        }
        
        if (reason_code && reason_code.trim() && !REASON_CODES[reason_code.trim()]) {
            throw new Error(`無効な理由コードです: ${reason_code}`);
        }
        
        const trimmedPartCode = part_code.trim();
        const trimmedReasonCode = reason_code ? reason_code.trim() : null;
        const trimmedRemarks = remarks ? remarks.trim() : null;
        
        console.log(`🔢 棚おろし処理中: ${trimmedPartCode} (実地数量: ${actual_quantity})`);
        
        // 現在の帳簿在庫を取得
        const [inventoryResults] = await connection.execute(
            'SELECT COALESCE(current_stock, 0) as current_stock FROM inventory WHERE part_code = ?',
            [trimmedPartCode]
        );
        
        // 帳簿在庫（レコードが存在しない場合は0）
        const book_quantity = inventoryResults.length > 0 ? inventoryResults[0].current_stock : 0;
        const difference = actual_quantity - book_quantity;
        
        // 差異がある場合のカウント
        if (difference !== 0) {
            difference_count++;
        }
        
        console.log(`  📊 ${trimmedPartCode}: 帳簿${book_quantity} → 実地${actual_quantity} (差異: ${difference})`);
        
        // 棚おろし記録を保存
        const [stocktakingResult] = await connection.execute(
            `INSERT INTO stocktaking (
                stocktaking_date, part_code, book_quantity, 
                actual_quantity, difference, reason_code, remarks,
                created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                stocktaking_date, trimmedPartCode, book_quantity,
                actual_quantity, difference, trimmedReasonCode, trimmedRemarks,
                username
            ]
        );
        
        // 在庫数量を実地数量に更新
        await updateInventoryStock(
            connection, 
            trimmedPartCode, 
            actual_quantity, 
            difference, 
            book_quantity,
            stocktakingResult.insertId, 
            username
        );
        
        processed_count++;
        stocktaking_records.push({
            part_code: trimmedPartCode,
            book_quantity,
            actual_quantity,
            difference,
            reason_code: trimmedReasonCode,
            remarks: trimmedRemarks
        });
    }
    
    return {
        processed_count,
        difference_count,
        stocktaking_records
    };
}

// ==========================================
// 内部関数: 在庫数量更新処理
// 目的: 棚おろし結果に基づき在庫数量を更新、トランザクション履歴を記録
// ==========================================
async function updateInventoryStock(connection, part_code, new_stock, difference, before_stock, stocktaking_id, username) {
    // 在庫レコードの存在確認・作成（UPSERT）
    await connection.execute(
        `INSERT INTO inventory (part_code, current_stock, reserved_stock, safety_stock, updated_at)
         VALUES (?, ?, 0, 0, NOW())
         ON DUPLICATE KEY UPDATE 
             current_stock = ?, 
             updated_at = NOW()`,
        [part_code, new_stock, new_stock]
    );
    
    // 差異がある場合のみトランザクション履歴を記録
    if (difference !== 0) {
        await connection.execute(
            `INSERT INTO inventory_transactions (
                part_code, transaction_type, quantity, 
                before_stock, after_stock, reference_id, reference_type,
                transaction_date, remarks, created_by
            ) VALUES (?, '棚おろし修正', ?, ?, ?, ?, 'stocktaking', NOW(), ?, ?)`,
            [
                part_code, 
                difference, 
                before_stock, 
                new_stock, 
                stocktaking_id, 
                `棚おろしによる在庫修正 (差異: ${difference > 0 ? '+' : ''}${difference})`,
                username
            ]
        );
        
        console.log(`  💾 在庫更新・履歴記録完了: ${part_code} ${before_stock} → ${new_stock} (差異: ${difference > 0 ? '+' : ''}${difference})`);
    } else {
        console.log(`  ✅ 差異なし・在庫確認: ${part_code} (${new_stock})`);
    }
}

module.exports = router;