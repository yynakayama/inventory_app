const express = require('express');
const mysql = require('mysql2/promise');
const router = express.Router();

// データベース接続設定
const dbConfig = {
  host: 'mysql',
  user: 'root',
  password: 'password',
  database: 'inventory_db'
};

/**
 * 予定入荷一覧取得
 * GET /api/scheduled-receipts
 * クエリパラメータ:
 * - status: ステータスでフィルタ
 * - part_code: 部品コードでフィルタ
 * - from_date, to_date: 予定入荷日範囲
 */
router.get('/', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const { status, part_code, from_date, to_date } = req.query;
    
    let whereConditions = [];
    let params = [];
    
    // ステータスフィルタ
    if (status) {
      whereConditions.push('sr.status = ?');
      params.push(status);
    }
    
    // 部品コードフィルタ
    if (part_code) {
      whereConditions.push('sr.part_code LIKE ?');
      params.push(`%${part_code}%`);
    }
    
    // 予定入荷日範囲フィルタ
    if (from_date) {
      whereConditions.push('sr.scheduled_date >= ?');
      params.push(from_date);
    }
    if (to_date) {
      whereConditions.push('sr.scheduled_date <= ?');
      params.push(to_date);
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';
    
    const query = `
      SELECT 
        sr.id,
        sr.order_no,
        sr.part_code,
        p.specification,
        sr.supplier,
        sr.order_quantity,
        sr.scheduled_quantity,
        sr.order_date,
        sr.requested_date,
        sr.scheduled_date,
        sr.status,
        sr.remarks,
        sr.created_at,
        sr.updated_at,
        -- 利用可能在庫計算用の現在在庫も取得
        i.current_stock,
        i.reserved_stock
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      LEFT JOIN inventory i ON sr.part_code = i.part_code
      ${whereClause}
      ORDER BY sr.scheduled_date ASC, sr.created_at DESC
    `;
    
    const [rows] = await connection.execute(query, params);
    
    res.json({
      success: true,
      data: rows,
      count: rows.length
    });
    
  } catch (error) {
    console.error('予定入荷一覧取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '予定入荷一覧の取得に失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

/**
 * 発注登録
 * POST /api/scheduled-receipts
 * Body: {
 *   part_code: string,
 *   order_quantity: number,
 *   requested_date?: string,
 *   remarks?: string
 * }
 */
router.post('/', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    const { part_code, order_quantity, requested_date, remarks } = req.body;
    
    // バリデーション
    if (!part_code || !order_quantity || order_quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: '部品コードと発注数量（正の数）は必須です'
      });
    }
    
    // 部品マスタから仕入先情報を取得
    const [partRows] = await connection.execute(
      'SELECT supplier FROM parts WHERE part_code = ? AND is_active = TRUE',
      [part_code]
    );
    
    if (partRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品コードが見つかりません'
      });
    }
    
    const supplier = partRows[0].supplier || '仕入先未設定';
    
    // 発注登録（order_noはトリガーで自動採番）
    const [result] = await connection.execute(`
      INSERT INTO scheduled_receipts (
        part_code,
        supplier,
        order_quantity,
        order_date,
        requested_date,
        remarks,
        created_by
      ) VALUES (?, ?, ?, CURDATE(), ?, ?, 'api_user')
    `, [part_code, supplier, order_quantity, requested_date, remarks]);
    
    // 登録された発注情報を取得
    const [newOrder] = await connection.execute(`
      SELECT 
        sr.*,
        p.specification
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      WHERE sr.id = ?
    `, [result.insertId]);
    
    await connection.commit();
    
    res.status(201).json({
      success: true,
      message: '発注を登録しました',
      data: newOrder[0]
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('発注登録エラー:', error);
    res.status(500).json({
      success: false,
      message: '発注登録に失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

/**
 * 納期回答登録（予定数量・予定日更新）
 * PUT /api/scheduled-receipts/:id/delivery-response
 * Body: {
 *   scheduled_quantity: number,
 *   scheduled_date: string,
 *   remarks?: string
 * }
 */
router.put('/:id/delivery-response', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { scheduled_quantity, scheduled_date, remarks } = req.body;
    
    // バリデーション
    if (!scheduled_quantity || scheduled_quantity <= 0 || !scheduled_date) {
      return res.status(400).json({
        success: false,
        message: '予定入荷数量（正の数）と予定入荷日は必須です'
      });
    }
    
    // 現在の発注状態を確認
    const [orderRows] = await connection.execute(
      'SELECT * FROM scheduled_receipts WHERE id = ?',
      [id]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された発注が見つかりません'
      });
    }
    
    const currentOrder = orderRows[0];
    
    // 納期回答待ち状態のみ更新可能
    if (currentOrder.status !== '納期回答待ち') {
      return res.status(400).json({
        success: false,
        message: `ステータスが「納期回答待ち」の発注のみ納期回答できます（現在: ${currentOrder.status}）`
      });
    }
    
    // 納期回答を更新
    await connection.execute(`
      UPDATE scheduled_receipts 
      SET 
        scheduled_quantity = ?,
        scheduled_date = ?,
        status = '入荷予定',
        remarks = CONCAT(COALESCE(remarks, ''), '\n納期回答: ', ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [scheduled_quantity, scheduled_date, remarks || '納期回答済み', id]);
    
    // 更新後の情報を取得
    const [updatedOrder] = await connection.execute(`
      SELECT 
        sr.*,
        p.specification
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      WHERE sr.id = ?
    `, [id]);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '納期回答を登録しました',
      data: updatedOrder[0]
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('納期回答登録エラー:', error);
    res.status(500).json({
      success: false,
      message: '納期回答登録に失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

/**
 * 入荷実績との照合
 * PUT /api/scheduled-receipts/:id/mark-received
 * Body: {
 *   actual_quantity: number,
 *   receipt_date: string,
 *   remarks?: string
 * }
 */
router.put('/:id/mark-received', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { actual_quantity, receipt_date, remarks } = req.body;
    
    // バリデーション
    if (!actual_quantity || actual_quantity <= 0 || !receipt_date) {
      return res.status(400).json({
        success: false,
        message: '実入荷数量（正の数）と入荷日は必須です'
      });
    }
    
    // 現在の予定入荷状態を確認
    const [orderRows] = await connection.execute(
      'SELECT * FROM scheduled_receipts WHERE id = ?',
      [id]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された予定入荷が見つかりません'
      });
    }
    
    const currentOrder = orderRows[0];
    
    // 入荷予定状態のみ処理可能
    if (currentOrder.status !== '入荷予定') {
      return res.status(400).json({
        success: false,
        message: `ステータスが「入荷予定」の発注のみ入荷処理できます（現在: ${currentOrder.status}）`
      });
    }
    
    // 予定入荷を入荷済みに更新
    await connection.execute(`
      UPDATE scheduled_receipts 
      SET 
        status = '入荷済み',
        remarks = CONCAT(COALESCE(remarks, ''), '\n入荷実績: ', ?, '個 (', ?, ')'),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [actual_quantity, receipt_date, remarks || '入荷完了', id]);
    
    // 実際の入荷処理は inventory API で行う想定
    // ここでは予定入荷のステータス更新のみ
    
    // 更新後の情報を取得
    const [updatedOrder] = await connection.execute(`
      SELECT 
        sr.*,
        p.specification
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      WHERE sr.id = ?
    `, [id]);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '入荷実績を反映しました',
      data: updatedOrder[0],
      note: '在庫数量の更新は /api/inventory/{part_code}/receipt で別途実行してください'
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('入荷実績処理エラー:', error);
    res.status(500).json({
      success: false,
      message: '入荷実績処理に失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

/**
 * 発注キャンセル
 * PUT /api/scheduled-receipts/:id/cancel
 * Body: {
 *   reason?: string
 * }
 */
router.put('/:id/cancel', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.beginTransaction();
    
    const { id } = req.params;
    const { reason } = req.body;
    
    // 現在の発注状態を確認
    const [orderRows] = await connection.execute(
      'SELECT * FROM scheduled_receipts WHERE id = ?',
      [id]
    );
    
    if (orderRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された発注が見つかりません'
      });
    }
    
    const currentOrder = orderRows[0];
    
    // 入荷済み以外はキャンセル可能
    if (currentOrder.status === '入荷済み') {
      return res.status(400).json({
        success: false,
        message: '入荷済みの発注はキャンセルできません'
      });
    }
    
    // 発注をキャンセル状態に更新
    await connection.execute(`
      UPDATE scheduled_receipts 
      SET 
        status = 'キャンセル',
        remarks = CONCAT(COALESCE(remarks, ''), '\nキャンセル理由: ', ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [reason || 'キャンセル', id]);
    
    // 更新後の情報を取得
    const [updatedOrder] = await connection.execute(`
      SELECT 
        sr.*,
        p.specification
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      WHERE sr.id = ?
    `, [id]);
    
    await connection.commit();
    
    res.json({
      success: true,
      message: '発注をキャンセルしました',
      data: updatedOrder[0]
    });
    
  } catch (error) {
    await connection.rollback();
    console.error('発注キャンセルエラー:', error);
    res.status(500).json({
      success: false,
      message: '発注キャンセルに失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

/**
 * 予定入荷詳細取得
 * GET /api/scheduled-receipts/:id
 */
router.get('/:id', async (req, res) => {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    const { id } = req.params;
    
    const [rows] = await connection.execute(`
      SELECT 
        sr.*,
        p.specification,
        p.lead_time_days,
        i.current_stock,
        i.reserved_stock
      FROM scheduled_receipts sr
      JOIN parts p ON sr.part_code = p.part_code
      LEFT JOIN inventory i ON sr.part_code = i.part_code
      WHERE sr.id = ?
    `, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された予定入荷が見つかりません'
      });
    }
    
    res.json({
      success: true,
      data: rows[0]
    });
    
  } catch (error) {
    console.error('予定入荷詳細取得エラー:', error);
    res.status(500).json({
      success: false,
      message: '予定入荷詳細の取得に失敗しました',
      error: error.message
    });
  } finally {
    await connection.end();
  }
});

module.exports = router;