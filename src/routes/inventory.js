const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// データベース接続設定（server.jsと統一）
const dbConfig = {
  host: process.env.DB_HOST || 'mysql',  // localhostではなくmysql
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'inventory_db',
  charset: 'utf8mb4',
  timezone: '+09:00'
};

// コネクションプール作成
const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * 在庫一覧取得API
 * GET /api/inventory
 * クエリパラメータ:
 * - search: 部品コード・仕様での検索
 * - category: カテゴリでのフィルタ
 * - low_stock: 安全在庫を下回る部品のみ表示
 */
router.get('/', async (req, res) => {
  try {
    const { search, category, low_stock } = req.query;
    
    let sql = `
      SELECT 
        i.part_code,
        p.specification,
        p.safety_stock,
        p.lead_time_days,
        p.supplier,
        p.category,
        i.current_stock,
        i.reserved_stock,
        (i.current_stock - i.reserved_stock) as available_stock,
        i.updated_at,
        CASE 
          WHEN i.current_stock <= COALESCE(p.safety_stock, 0) THEN true 
          ELSE false 
        END as is_low_stock
      FROM inventory i
      LEFT JOIN parts p ON i.part_code = p.part_code AND p.is_active = true
      WHERE 1=1
    `;
    
    const params = [];
    
    // 検索条件の追加（部品コードまたは仕様で検索）
    if (search) {
      sql += ` AND (i.part_code LIKE ? OR p.specification LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    // カテゴリフィルタの追加
    if (category) {
      sql += ` AND p.category = ?`;
      params.push(category);
    }
    
    // 安全在庫切れフィルタの追加
    if (low_stock === 'true') {
      sql += ` AND i.current_stock <= COALESCE(p.safety_stock, 0)`;
    }
    
    sql += ` ORDER BY i.part_code`;
    
    const [rows] = await pool.execute(sql, params);
    
    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
    
  } catch (error) {
    console.error('在庫一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
});

/**
 * 特定部品の在庫詳細取得API
 * GET /api/inventory/:part_code
 */
router.get('/:part_code', async (req, res) => {
  try {
    const { part_code } = req.params;
    
    const sql = `
      SELECT 
        i.part_code,
        p.specification,
        COALESCE(p.safety_stock, 0) as safety_stock,
        COALESCE(p.lead_time_days, 0) as lead_time_days,
        p.supplier,
        p.category,
        p.unit_price,
        i.current_stock,
        i.reserved_stock,
        (i.current_stock - i.reserved_stock) as available_stock,
        i.updated_at,
        CASE 
          WHEN i.current_stock <= COALESCE(p.safety_stock, 0) THEN true 
          ELSE false 
        END as is_low_stock
      FROM inventory i
      LEFT JOIN parts p ON i.part_code = p.part_code AND p.is_active = true
      WHERE i.part_code = ?
    `;
    
    const [rows] = await pool.execute(sql, [part_code]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品の在庫情報が見つかりません'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
    
  } catch (error) {
    console.error('在庫詳細取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
});

/**
 * 在庫数量更新API（手動調整）
 * PUT /api/inventory/:part_code
 * Body: { current_stock: number, reason?: string }
 */
router.put('/:part_code', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { part_code } = req.params;
    const { current_stock, reason = '手動調整' } = req.body;
    
    // バリデーション
    if (typeof current_stock !== 'number' || current_stock < 0) {
      return res.status(400).json({
        success: false,
        message: '在庫数量は0以上の数値で入力してください'
      });
    }
    
    await connection.beginTransaction();
    
    // 現在の在庫情報を取得
    const [currentRows] = await connection.execute(
      'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?',
      [part_code]
    );
    
    if (currentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '指定された部品が見つかりません'
      });
    }
    
    const oldStock = currentRows[0].current_stock;
    const reservedStock = currentRows[0].reserved_stock;
    
    // 在庫マイナス防止チェック（予約在庫考慮）
    if (current_stock < reservedStock) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `在庫数量は予約済み在庫（${reservedStock}）以上である必要があります`
      });
    }
    
    // 在庫数量を更新
    await connection.execute(
      'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
      [current_stock, part_code]
    );
    
    // 在庫履歴を記録
    const stockDifference = current_stock - oldStock;
    await connection.execute(
      `INSERT INTO inventory_transactions 
       (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [part_code, '手動調整', stockDifference, oldStock, current_stock, reason]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '在庫数量を更新しました',
      data: {
        part_code,
        old_stock: oldStock,
        new_stock: current_stock,
        difference: stockDifference
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('在庫更新エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

/**
 * 入荷処理API
 * POST /api/inventory/:part_code/receipt
 * Body: { quantity: number, supplier?: string, remarks?: string }
 */
router.post('/:part_code/receipt', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { part_code } = req.params;
    const { quantity, supplier = '', remarks = '' } = req.body;
    
    // バリデーション
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: '入荷数量は1以上の数値で入力してください'
      });
    }
    
    await connection.beginTransaction();
    
    // 部品マスタの存在確認
    const [partRows] = await connection.execute(
      'SELECT part_code FROM parts WHERE part_code = ? AND is_active = true',
      [part_code]
    );
    
    if (partRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '指定された部品が見つかりません'
      });
    }
    
    // 在庫レコードの存在確認・作成
    const [inventoryRows] = await connection.execute(
      'SELECT current_stock FROM inventory WHERE part_code = ?',
      [part_code]
    );
    
    let currentStock = 0;
    if (inventoryRows.length === 0) {
      // 在庫レコードが存在しない場合は新規作成
      await connection.execute(
        'INSERT INTO inventory (part_code, current_stock, reserved_stock, updated_at) VALUES (?, 0, 0, NOW())',
        [part_code]
      );
    } else {
      currentStock = inventoryRows[0].current_stock;
    }
    
    const newStock = currentStock + quantity;
    
    // 在庫数量を更新
    await connection.execute(
      'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
      [newStock, part_code]
    );
    
    // 在庫トランザクション履歴を記録
    await connection.execute(
      `INSERT INTO inventory_transactions 
       (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        part_code, 
        '入荷', 
        quantity, 
        currentStock, 
        newStock, 
        `入荷処理: ${remarks}${supplier ? ` (仕入先: ${supplier})` : ''}`
      ]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '入荷処理が完了しました',
      data: {
        part_code,
        receipt_quantity: quantity,
        old_stock: currentStock,
        new_stock: newStock,
        supplier
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('入荷処理エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

/**
 * 出庫処理API
 * POST /api/inventory/:part_code/issue
 * Body: { quantity: number, purpose?: string, remarks?: string }
 */
router.post('/:part_code/issue', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const { part_code } = req.params;
    const { quantity, purpose = '生産投入', remarks = '' } = req.body;
    
    // バリデーション
    if (typeof quantity !== 'number' || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: '出庫数量は1以上の数値で入力してください'
      });
    }
    
    await connection.beginTransaction();
    
    // 現在の在庫情報を取得
    const [inventoryRows] = await connection.execute(
      'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?',
      [part_code]
    );
    
    if (inventoryRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: '指定された部品の在庫情報が見つかりません'
      });
    }
    
    const currentStock = inventoryRows[0].current_stock;
    const reservedStock = inventoryRows[0].reserved_stock;
    const availableStock = currentStock - reservedStock;
    
    // 在庫不足チェック
    if (quantity > availableStock) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `利用可能在庫が不足しています（利用可能: ${availableStock}、要求: ${quantity}）`
      });
    }
    
    const newStock = currentStock - quantity;
    
    // 在庫数量を更新
    await connection.execute(
      'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?',
      [newStock, part_code]
    );
    
    // 在庫トランザクション履歴を記録
    await connection.execute(
      `INSERT INTO inventory_transactions 
       (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date) 
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        part_code, 
        '出庫', 
        -quantity, 
        currentStock, 
        newStock, 
        `${purpose}: ${remarks}`
      ]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '出庫処理が完了しました',
      data: {
        part_code,
        issue_quantity: quantity,
        old_stock: currentStock,
        new_stock: newStock,
        available_stock: availableStock - quantity,
        purpose
      }
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('出庫処理エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

/**
 * 在庫履歴取得API
 * GET /api/inventory/:part_code/history
 */
router.get('/:part_code/history', async (req, res) => {
  try {
    const { part_code } = req.params;
    const { limit = 50 } = req.query;
    
    const sql = `
      SELECT 
        id,
        transaction_type,
        quantity,
        before_stock,
        after_stock,
        remarks,
        transaction_date,
        created_by
      FROM inventory_transactions 
      WHERE part_code = ? 
      ORDER BY transaction_date DESC, id DESC
      LIMIT ?
    `;
    
    const [rows] = await pool.execute(sql, [part_code, parseInt(limit)]);
    
    res.json({
      success: true,
      data: rows,
      total: rows.length
    });
    
  } catch (error) {
    console.error('在庫履歴取得エラー:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました',
      error: error.message
    });
  }
});

module.exports = router;