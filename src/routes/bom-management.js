
/**
 * BOM・マスター管理API
 * 権限: admin, production_manager
 */

const express = require('express');
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin, requireReadAccess } = require('../middleware/auth');

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
// 1. 製品 (Product) API
// ==========================================

/**
 * 製品一覧取得
 */
router.get('/products', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    try {
        const query = `
            SELECT product_code, remarks, created_at, updated_at
            FROM products 
            WHERE is_active = TRUE
            ORDER BY product_code
        `;
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query);
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: '製品一覧の取得に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品新規作成
 */
router.post('/products', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { product_code, remarks = null } = req.body;
        if (!product_code || !/^[A-Za-z0-9\-]+$/.test(product_code)) {
            return res.status(400).json({ success: false, message: '製品コードは必須で、英数字とハイフンのみ使用できます' });
        }
        const query = `INSERT INTO products (product_code, remarks) VALUES (?, ?)`;
        connection = await mysql.createConnection(dbConfig);
        await connection.execute(query, [product_code, remarks]);
        res.status(201).json({ success: true, message: '製品を作成しました' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ success: false, message: '同じ製品コードが既に存在します' });
        } else {
            res.status(500).json({ success: false, message: '製品の作成に失敗しました', error: error.message });
        }
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品更新
 */
router.put('/products/:productCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productCode } = req.params;
        const { remarks } = req.body;
        const query = `UPDATE products SET remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE product_code = ? AND is_active = TRUE`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [remarks, productCode]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定された製品が見つかりません' });
        }
        res.json({ success: true, message: '製品を更新しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: '製品の更新に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品削除 (論理削除)
 */
router.delete('/products/:productCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productCode } = req.params;
        const query = `UPDATE products SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE product_code = ?`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [productCode]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定された製品が見つかりません' });
        }
        res.json({ success: true, message: '製品を削除しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: '製品の削除に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// ==========================================
// 2. 工程 (Station) API
// ==========================================

/**
 * 全工程一覧取得
 */
router.get('/stations', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    try {
        const query = `
            SELECT station_code, process_group, remarks
            FROM work_stations 
            WHERE is_active = TRUE
            ORDER BY process_group, station_code
        `;
        connection = await mysql.createConnection(dbConfig);
        const [results] = await connection.execute(query);
        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, message: '工程一覧の取得に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 工程新規作成・復活
 */
router.post('/stations', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { station_code, process_group, remarks = null } = req.body;
        if (!station_code || !process_group) {
            return res.status(400).json({ success: false, message: '工程コードと工程グループは必須です' });
        }

        connection = await mysql.createConnection(dbConfig);

        // 既存の論理削除された工程を探す
        const findQuery = `SELECT station_code FROM work_stations WHERE station_code = ?`;
        const [existing] = await connection.execute(findQuery, [station_code]);

        if (existing.length > 0) {
            // 既存工程があれば復活・更新
            const updateQuery = `UPDATE work_stations SET process_group = ?, remarks = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE station_code = ?`;
            await connection.execute(updateQuery, [process_group, remarks, station_code]);
            res.status(200).json({ success: true, message: '既存の工程を復活・更新しました' });
        } else {
            // なければ新規作成
            const insertQuery = `INSERT INTO work_stations (station_code, process_group, remarks) VALUES (?, ?, ?)`;
            await connection.execute(insertQuery, [station_code, process_group, remarks]);
            res.status(201).json({ success: true, message: '工程を作成しました' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: '工程の作成に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 工程更新
 */
router.put('/stations/:stationCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { stationCode } = req.params;
        const { process_group, remarks } = req.body;
        if (!process_group) {
            return res.status(400).json({ success: false, message: '工程グループは必須です' });
        }
        const query = `UPDATE work_stations SET process_group = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE station_code = ? AND is_active = TRUE`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [process_group, remarks, stationCode]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定された工程が見つかりません' });
        }
        res.json({ success: true, message: '工程を更新しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: '工程の更新に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 工程削除 (論理削除)
 */
router.delete('/stations/:stationCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { stationCode } = req.params;
        const query = `UPDATE work_stations SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE station_code = ?`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [stationCode]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定された工程が見つかりません' });
        }
        res.json({ success: true, message: '工程を削除しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: '工程の削除に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


// ==========================================
// 3. BOM (Bill of Materials) API
// ==========================================

/**
 * 指定製品に関連付け可能な工程一覧取得
 */
router.get('/products/:productCode/available-stations', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    try {
        const { productCode } = req.params;
        const query = `
            SELECT ws.station_code, ws.process_group, ws.remarks
            FROM work_stations ws
            WHERE ws.is_active = TRUE
            AND NOT EXISTS (
                SELECT 1 FROM product_station_associations psa
                WHERE psa.product_code = ? AND psa.station_code = ws.station_code AND psa.is_active = TRUE
            )
            ORDER BY ws.process_group, ws.station_code
        `;
        connection = await mysql.createConnection(dbConfig);
        const [stations] = await connection.execute(query, [productCode]);
        res.json({ success: true, data: stations });
    } catch (error) {
        res.status(500).json({ success: false, message: '利用可能工程一覧の取得に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 指定製品の関連工程一覧取得
 */
router.get('/products/:productCode/stations', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    try {
        const { productCode } = req.params;
        const query = `
            SELECT
                ws.station_code, ws.process_group, ws.remarks,
                (SELECT COUNT(*) FROM bom_items bi WHERE bi.station_code = ws.station_code AND bi.product_code = ? AND bi.is_active = TRUE) as parts_count
            FROM work_stations ws
            INNER JOIN product_station_associations psa ON ws.station_code = psa.station_code
            WHERE ws.is_active = TRUE
            AND psa.is_active = TRUE
            AND psa.product_code = ?
            ORDER BY psa.sequence_number, ws.process_group, ws.station_code
        `;
        connection = await mysql.createConnection(dbConfig);
        const [stations] = await connection.execute(query, [productCode, productCode]);
        res.json({ success: true, data: { product_code: productCode, stations: stations } });
    } catch (error) {
        res.status(500).json({ success: false, message: '工程一覧の取得に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品と工程を関連付ける
 */
router.post('/products/:productCode/stations/:stationCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productCode, stationCode } = req.params;

        connection = await mysql.createConnection(dbConfig);

        // 製品と工程の存在確認
        const productQuery = `SELECT product_code FROM products WHERE product_code = ? AND is_active = TRUE`;
        const stationQuery = `SELECT station_code FROM work_stations WHERE station_code = ? AND is_active = TRUE`;

        const [productResult] = await connection.execute(productQuery, [productCode]);
        const [stationResult] = await connection.execute(stationQuery, [stationCode]);

        if (productResult.length === 0) {
            return res.status(404).json({ success: false, message: '指定された製品が見つかりません' });
        }
        if (stationResult.length === 0) {
            return res.status(404).json({ success: false, message: '指定された工程が見つかりません' });
        }

        // 既に関連付けられているかチェック
        const checkQuery = `SELECT 1 FROM product_station_associations WHERE product_code = ? AND station_code = ? AND is_active = TRUE LIMIT 1`;
        const [existing] = await connection.execute(checkQuery, [productCode, stationCode]);

        if (existing.length > 0) {
            return res.status(409).json({ success: false, message: 'この製品と工程は既に関連付けられています' });
        }

        // 製品-工程関連付けを作成
        const insertQuery = `INSERT INTO product_station_associations (product_code, station_code, sequence_number, remarks) VALUES (?, ?, 0, 'BOM管理画面から追加')`;
        await connection.execute(insertQuery, [productCode, stationCode]);

        res.json({ success: true, message: '製品と工程を関連付けました' });
    } catch (error) {
        res.status(500).json({ success: false, message: '製品と工程の関連付けに失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * 製品と工程の関連付け解除 (関連付けとBOM項目を論理削除)
 */
router.delete('/products/:productCode/stations/:stationCode', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productCode, stationCode } = req.params;
        connection = await mysql.createConnection(dbConfig);

        await connection.beginTransaction();

        // 1. 製品-工程関連付けを論理削除
        const associationQuery = `UPDATE product_station_associations SET is_active = FALSE WHERE product_code = ? AND station_code = ?`;
        await connection.execute(associationQuery, [productCode, stationCode]);

        // 2. 配下のBOM項目も論理削除
        const bomQuery = `UPDATE bom_items SET is_active = FALSE WHERE product_code = ? AND station_code = ?`;
        await connection.execute(bomQuery, [productCode, stationCode]);

        await connection.commit();
        res.json({ success: true, message: '製品と工程の関連付けを解除しました' });
    } catch (error) {
        if (connection) await connection.rollback();
        res.status(500).json({ success: false, message: '製品と工程の関連付け解除に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});


/**
 * 指定工程の使用部品一覧取得
 */
router.get('/products/:productCode/stations/:stationCode/parts', authenticateToken, requireReadAccess, async (req, res) => {
    let connection;
    try {
        const { productCode, stationCode } = req.params;
        const query = `
            SELECT b.id, b.part_code, p.specification, b.quantity, p.unit, b.remarks
            FROM bom_items b
            INNER JOIN parts p ON b.part_code = p.part_code
            WHERE b.product_code = ? AND b.station_code = ? AND b.is_active = TRUE AND p.is_active = TRUE
            ORDER BY b.part_code
        `;
        connection = await mysql.createConnection(dbConfig);
        const [parts] = await connection.execute(query, [productCode, stationCode]);
        res.json({ success: true, data: { product_code: productCode, station_code: stationCode, parts: parts } });
    } catch (error) {
        res.status(500).json({ success: false, message: '使用部品一覧の取得に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目追加（工程に部品追加）
 */
router.post('/items', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { product_code, station_code, part_code, quantity = 1, remarks = null } = req.body;
        if (!product_code || !station_code || !part_code || quantity <= 0) {
            return res.status(400).json({ success: false, message: '製品、工程、部品コードと有効な数量は必須です' });
        }
        
        // 既存の非アクティブな項目を探す
        const findQuery = `SELECT id FROM bom_items WHERE product_code = ? AND station_code = ? AND part_code = ?`;
        connection = await mysql.createConnection(dbConfig);
        const [existing] = await connection.execute(findQuery, [product_code, station_code, part_code]);

        if (existing.length > 0) {
            // 既存項目があれば更新して有効化
            const updateQuery = `UPDATE bom_items SET quantity = ?, remarks = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            await connection.execute(updateQuery, [quantity, remarks, existing[0].id]);
            res.status(200).json({ success: true, message: '既存のBOM項目を更新・有効化しました' });
        } else {
            // なければ新規作成
            const insertQuery = `INSERT INTO bom_items (product_code, station_code, part_code, quantity, remarks) VALUES (?, ?, ?, ?, ?)`;
            await connection.execute(insertQuery, [product_code, station_code, part_code, quantity, remarks]);
            res.status(201).json({ success: true, message: 'BOM項目を追加しました' });
        }
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             res.status(409).json({ success: false, message: '同じ製品・工程・部品の組み合わせが既に存在します' });
        } else {
            res.status(500).json({ success: false, message: 'BOM項目の追加に失敗しました', error: error.message });
        }
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目更新
 */
router.put('/items/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { quantity, remarks } = req.body;
        if (quantity !== undefined && quantity <= 0) {
            return res.status(400).json({ success: false, message: '数量は1以上である必要があります' });
        }
        const query = `UPDATE bom_items SET quantity = ?, remarks = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_active = TRUE`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [quantity, remarks, id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定されたBOM項目が見つかりません' });
        }
        res.json({ success: true, message: 'BOM項目を更新しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'BOM項目の更新に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * BOM項目削除 (論理削除)
 */
router.delete('/items/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const query = `UPDATE bom_items SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(query, [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: '指定されたBOM項目が見つかりません' });
        }
        res.json({ success: true, message: 'BOM項目を削除しました' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'BOM項目の削除に失敗しました', error: error.message });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;
