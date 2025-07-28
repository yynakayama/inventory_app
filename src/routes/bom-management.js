/**
 * BOM管理API
 * 製品選択 → 工程一覧表示 → 工程選択 → 使用部品一覧表示・編集
 * 権限: 生産管理権限（admin, production_manager）
 */

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireProductionAccess, requireReadAccess } = require('../middleware/auth');

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

// ==========================================
// 1. 製品関連API
// ==========================================

/**
 * 製品一覧取得
 * GET /api/bom/products
 * 権限: 全ユーザー（参照系）
 */
router.get('/products', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const query = `
            SELECT 
                product_code,
                remarks,
                created_at,
                updated_at
            FROM products 
            WHERE is_active = TRUE
            ORDER BY product_code
        `;
        
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query);
        
        console.log(`[${new Date().toISOString()}] 製品一覧取得: ユーザー=${req.user.username}, 件数=${results.length}`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `製品一覧を取得しました (${results.length}件)`
        });
        
    } catch (error) {
        console.error('製品一覧取得エラー:', error.message);
        res.status(500).json({
            success: false,
            message: '製品一覧の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品新規作成
 * POST /api/bom/products
 * 権限: 生産管理権限（admin, production_manager）
 */
router.post('/products', authenticateToken, requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const { product_code, remarks = null } = req.body;
        
        // 入力チェック
        if (!product_code) {
            return res.status(400).json({
                success: false,
                message: '製品コードは必須です'
            });
        }
        
        // 製品コードの形式チェック（英数字とハイフンのみ）
        if (!/^[A-Za-z0-9\-]+$/.test(product_code)) {
            return res.status(400).json({
                success: false,
                message: '製品コードは英数字とハイフンのみ使用できます'
            });
        }
        
        const query = `
            INSERT INTO products (product_code, remarks)
            VALUES (?, ?)
        `;
        
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [product_code, remarks]);
        
        console.log(`[${new Date().toISOString()}] 製品作成: ユーザー=${req.user.username}, 製品コード=${product_code}`);
        
        res.status(201).json({
            success: true,
            data: {
                product_code,
                remarks,
                created_by: req.user.username
            },
            message: '製品を作成しました'
        });
        
    } catch (error) {
        console.error('製品作成エラー:', error.message);
        
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({
                success: false,
                message: '同じ製品コードが既に存在します'
            });
        } else {
            res.status(500).json({
                success: false,
                message: '製品の作成に失敗しました',
                error: error.message
            });
        }
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 2. 工程関連API
// ==========================================

/**
 * 指定製品の工程一覧取得
 * GET /api/bom/products/:productCode/stations
 * 権限: 全ユーザー（参照系）
 */
router.get('/products/:productCode/stations', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { productCode } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 製品が存在するかチェック
        const [productResults] = await connection.execute(
            'SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE',
            [productCode]
        );
        
        if (productResults.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された製品が見つかりません'
            });
        }
        
        // 製品で使用されている工程一覧を取得
        const stationsQuery = `
            SELECT DISTINCT
                ws.station_code,
                ws.process_group,
                ws.remarks,
                COUNT(b.part_code) as parts_count
            FROM work_stations ws
            LEFT JOIN bom_items b ON ws.station_code = b.station_code 
                AND b.product_code = ? AND b.is_active = TRUE
            WHERE ws.is_active = TRUE
            GROUP BY ws.station_code, ws.process_group, ws.remarks
            ORDER BY ws.process_group, ws.station_code
        `;
        
        const [stations] = await connection.execute(stationsQuery, [productCode]);
        
        console.log(`[${new Date().toISOString()}] 工程一覧取得: ユーザー=${req.user.username}, 製品=${productCode}, 件数=${stations.length}`);
        
        res.json({
            success: true,
            data: {
                product_code: productCode,
                stations: stations
            },
            count: stations.length,
            message: `製品 ${productCode} の工程一覧を取得しました (${stations.length}件)`
        });
        
    } catch (error) {
        console.error('工程一覧取得エラー:', error.message);
        res.status(500).json({
            success: false,
            message: '工程一覧の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 全工程一覧取得（工程追加用）
 * GET /api/bom/stations
 * 権限: 全ユーザー（参照系）
 */
router.get('/stations', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const query = `
            SELECT 
                station_code,
                process_group,
                remarks
            FROM work_stations 
            WHERE is_active = TRUE
            ORDER BY process_group, station_code
        `;
        
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query);
        
        console.log(`[${new Date().toISOString()}] 全工程一覧取得: ユーザー=${req.user.username}, 件数=${results.length}`);
        
        res.json({
            success: true,
            data: results,
            count: results.length,
            message: `全工程一覧を取得しました (${results.length}件)`
        });
        
    } catch (error) {
        console.error('全工程一覧取得エラー:', error.message);
        res.status(500).json({
            success: false,
            message: '全工程一覧の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==========================================
// 3. BOM（使用部品）関連API
// ==========================================

/**
 * 指定工程の使用部品一覧取得
 * GET /api/bom/products/:productCode/stations/:stationCode/parts
 * 権限: 全ユーザー（参照系）
 */
router.get('/products/:productCode/stations/:stationCode/parts', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    
    try {
        const { productCode, stationCode } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 製品と工程の存在チェック
        const checksQuery = `
            SELECT 
                (SELECT COUNT(*) FROM products WHERE product_code = ? AND is_active = TRUE) as product_exists,
                (SELECT COUNT(*) FROM work_stations WHERE station_code = ? AND is_active = TRUE) as station_exists
        `;
        
        const [checks] = await connection.execute(checksQuery, [productCode, stationCode]);
        
        if (checks[0].product_exists === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された製品が見つかりません'
            });
        }
        
        if (checks[0].station_exists === 0) {
            return res.status(404).json({
                success: false,
                message: '指定された工程が見つかりません'
            });
        }
        
        // 使用部品一覧取得
        const partsQuery = `
            SELECT 
                b.id,
                b.part_code,
                p.specification,
                b.quantity,
                p.unit,
                p.supplier,
                p.lead_time_days,
                b.remarks,
                b.created_at,
                b.updated_at
            FROM bom_items b
            INNER JOIN parts p ON b.part_code = p.part_code
            WHERE b.product_code = ? 
                AND b.station_code = ? 
                AND b.is_active = TRUE
                AND p.is_active = TRUE
            ORDER BY b.part_code
        `;
        
        const [parts] = await connection.execute(partsQuery, [productCode, stationCode]);
        
        console.log(`[${new Date().toISOString()}] 使用部品一覧取得: ユーザー=${req.user.username}, 製品=${productCode}, 工程=${stationCode}, 件数=${parts.length}`);
        
        res.json({
            success: true,
            data: {
                product_code: productCode,
                station_code: stationCode,
                parts: parts
            },
            count: parts.length,
            message: `${productCode} - ${stationCode} の使用部品一覧を取得しました (${parts.length}件)`
        });
        
    } catch (error) {
        console.error('使用部品一覧取得エラー:', error.message);
        res.status(500).json({
            success: false,
            message: '使用部品一覧の取得に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目追加（工程に部品追加）
 * POST /api/bom/items
 * 権限: 生産管理権限（admin, production_manager）
 */
router.post('/items', authenticateToken, requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const { product_code, station_code, part_code, quantity = 1, remarks = null } = req.body;
        
        // 入力チェック
        if (!product_code || !station_code || !part_code) {
            return res.status(400).json({
                success: false,
                message: '製品コード、工程コード、部品コードは必須です'
            });
        }
        
        if (quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '数量は1以上である必要があります'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 関連マスタの存在チェック
        const validationQuery = `
            SELECT 
                (SELECT COUNT(*) FROM products WHERE product_code = ? AND is_active = TRUE) as product_exists,
                (SELECT COUNT(*) FROM work_stations WHERE station_code = ? AND is_active = TRUE) as station_exists,
                (SELECT COUNT(*) FROM parts WHERE part_code = ? AND is_active = TRUE) as part_exists,
                (SELECT COUNT(*) FROM bom_items WHERE product_code = ? AND station_code = ? AND part_code = ? AND is_active = TRUE) as bom_exists
        `;
        
        const [validations] = await connection.execute(validationQuery, [
            product_code, station_code, part_code, product_code, station_code, part_code
        ]);
        
        const validation = validations[0];
        
        if (validation.product_exists === 0) {
            return res.status(400).json({
                success: false,
                message: '存在しない製品コードが指定されています'
            });
        }
        
        if (validation.station_exists === 0) {
            return res.status(400).json({
                success: false,
                message: '存在しない工程コードが指定されています'
            });
        }
        
        if (validation.part_exists === 0) {
            return res.status(400).json({
                success: false,
                message: '存在しない部品コードが指定されています'
            });
        }
        
        if (validation.bom_exists > 0) {
            return res.status(409).json({
                success: false,
                message: '同じ製品・工程・部品の組み合わせが既に存在します'
            });
        }
        
        // BOM項目追加
        const insertQuery = `
            INSERT INTO bom_items (product_code, station_code, part_code, quantity, remarks)
            VALUES (?, ?, ?, ?, ?)
        `;
        
        const [result] = await connection.execute(insertQuery, [product_code, station_code, part_code, quantity, remarks]);
        
        console.log(`[${new Date().toISOString()}] BOM項目追加: ユーザー=${req.user.username}, 製品=${product_code}, 工程=${station_code}, 部品=${part_code}, 数量=${quantity}`);
        
        res.status(201).json({
            success: true,
            data: {
                id: result.insertId,
                product_code,
                station_code,
                part_code,
                quantity,
                remarks,
                created_by: req.user.username
            },
            message: 'BOM項目を追加しました'
        });
        
    } catch (error) {
        console.error('BOM項目追加エラー:', error.message);
        res.status(500).json({
            success: false,
            message: 'BOM項目の追加に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目更新（数量変更等）
 * PUT /api/bom/items/:id
 * 権限: 生産管理権限（admin, production_manager）
 */
router.put('/items/:id', authenticateToken, requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        const { quantity, remarks } = req.body;
        
        // 入力チェック
        if (quantity !== undefined && quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: '数量は1以上である必要があります'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 更新対象の存在チェック
        const [existing] = await connection.execute(
            'SELECT id, product_code, station_code, part_code FROM bom_items WHERE id = ? AND is_active = TRUE',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたBOM項目が見つかりません'
            });
        }
        
        // 更新フィールドを動的に構築
        const updateFields = [];
        const updateValues = [];
        
        if (quantity !== undefined) {
            updateFields.push('quantity = ?');
            updateValues.push(quantity);
        }
        
        if (remarks !== undefined) {
            updateFields.push('remarks = ?');
            updateValues.push(remarks);
        }
        
        if (updateFields.length === 0) {
            return res.status(400).json({
                success: false,
                message: '更新する項目がありません'
            });
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        updateValues.push(id);
        
        const updateQuery = `
            UPDATE bom_items 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;
        
        await connection.execute(updateQuery, updateValues);
        
        console.log(`[${new Date().toISOString()}] BOM項目更新: ユーザー=${req.user.username}, ID=${id}, 数量=${quantity || '未変更'}`);
        
        res.json({
            success: true,
            data: { 
                id: parseInt(id), 
                quantity, 
                remarks,
                updated_by: req.user.username
            },
            message: 'BOM項目を更新しました'
        });
        
    } catch (error) {
        console.error('BOM項目更新エラー:', error.message);
        res.status(500).json({
            success: false,
            message: 'BOM項目の更新に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目削除
 * DELETE /api/bom/items/:id
 * 権限: 生産管理権限（admin, production_manager）
 */
router.delete('/items/:id', authenticateToken, requireProductionAccess, async (req, res) => {
    let connection;
    
    try {
        const { id } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 削除対象の存在チェック
        const [existing] = await connection.execute(
            'SELECT id, product_code, station_code, part_code FROM bom_items WHERE id = ? AND is_active = TRUE',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: '指定されたBOM項目が見つかりません'
            });
        }
        
        // 論理削除実行
        await connection.execute(
            'UPDATE bom_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [id]
        );
        
        console.log(`[${new Date().toISOString()}] BOM項目削除: ユーザー=${req.user.username}, ID=${id}, 製品=${existing[0].product_code}`);
        
        res.json({
            success: true,
            data: {
                ...existing[0],
                deleted_by: req.user.username
            },
            message: 'BOM項目を削除しました'
        });
        
    } catch (error) {
        console.error('BOM項目削除エラー:', error.message);
        res.status(500).json({
            success: false,
            message: 'BOM項目の削除に失敗しました',
            error: error.message
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;