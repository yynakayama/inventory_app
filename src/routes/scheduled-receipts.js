const express = require('express');
const router = express.Router();

/**
 * 予定入荷一覧取得
 * GET /api/scheduled-receipts
 * クエリパラメータ:
 * - status: ステータスでフィルタ
 * - part_code: 部品コードでフィルタ
 * - from_date, to_date: 予定入荷日範囲
 */
router.get('/', (req, res) => {
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
  
  req.db.query(query, params, (err, results) => {
    if (err) {
      console.error('予定入荷一覧取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '予定入荷一覧の取得に失敗しました',
        error: err.message
      });
      return;
    }
    
    res.json({
      success: true,
      data: results,
      count: results.length
    });
  });
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
router.post('/', (req, res) => {
  const { part_code, order_quantity, requested_date, remarks } = req.body;
  
  // バリデーション
  if (!part_code || !order_quantity || order_quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: '部品コードと発注数量（正の数）は必須です'
    });
  }
  
  // まず部品マスタから仕入先情報を取得
  const partQuery = 'SELECT supplier FROM parts WHERE part_code = ? AND is_active = TRUE';
  
  req.db.query(partQuery, [part_code], (err, partResults) => {
    if (err) {
      console.error('部品情報取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '部品情報の取得に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (partResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品コードが見つかりません'
      });
    }
    
    const supplier = partResults[0].supplier || '仕入先未設定';
    
    // 発注登録（order_noはトリガーで自動採番）
    const insertQuery = `
      INSERT INTO scheduled_receipts (
        part_code,
        supplier,
        order_quantity,
        order_date,
        requested_date,
        remarks,
        created_by
      ) VALUES (?, ?, ?, CURDATE(), ?, ?, 'api_user')
    `;
    
    req.db.query(insertQuery, [part_code, supplier, order_quantity, requested_date, remarks], (err, insertResult) => {
      if (err) {
        console.error('発注登録エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '発注登録に失敗しました',
          error: err.message
        });
        return;
      }
      
      // 登録された発注情報を取得
      const selectQuery = `
        SELECT 
          sr.*,
          p.specification
        FROM scheduled_receipts sr
        JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.id = ?
      `;
      
      req.db.query(selectQuery, [insertResult.insertId], (err, newOrder) => {
        if (err) {
          console.error('登録データ取得エラー:', err.message);
          res.status(500).json({
            success: false,
            message: '登録データの取得に失敗しました',
            error: err.message
          });
          return;
        }
        
        res.status(201).json({
          success: true,
          message: '発注を登録しました',
          data: newOrder[0]
        });
      });
    });
  });
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
router.put('/:id/delivery-response', (req, res) => {
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
  const selectQuery = 'SELECT * FROM scheduled_receipts WHERE id = ?';
  
  req.db.query(selectQuery, [id], (err, orderResults) => {
    if (err) {
      console.error('発注状態確認エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '発注状態の確認に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (orderResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された発注が見つかりません'
      });
    }
    
    const currentOrder = orderResults[0];
    
    // 納期回答待ち状態のみ更新可能
    if (currentOrder.status !== '納期回答待ち') {
      return res.status(400).json({
        success: false,
        message: `ステータスが「納期回答待ち」の発注のみ納期回答できます（現在: ${currentOrder.status}）`
      });
    }
    
    // 納期回答を更新
    const updateQuery = `
      UPDATE scheduled_receipts 
      SET 
        scheduled_quantity = ?,
        scheduled_date = ?,
        status = '入荷予定',
        remarks = CONCAT(COALESCE(remarks, ''), '\n納期回答: ', ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    req.db.query(updateQuery, [scheduled_quantity, scheduled_date, remarks || '納期回答済み', id], (err, updateResult) => {
      if (err) {
        console.error('納期回答登録エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '納期回答登録に失敗しました',
          error: err.message
        });
        return;
      }
      
      // 更新後の情報を取得
      const getUpdatedQuery = `
        SELECT 
          sr.*,
          p.specification
        FROM scheduled_receipts sr
        JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.id = ?
      `;
      
      req.db.query(getUpdatedQuery, [id], (err, updatedOrder) => {
        if (err) {
          console.error('更新データ取得エラー:', err.message);
          res.status(500).json({
            success: false,
            message: '更新データの取得に失敗しました',
            error: err.message
          });
          return;
        }
        
        res.json({
          success: true,
          message: '納期回答を登録しました',
          data: updatedOrder[0]
        });
      });
    });
  });
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
router.put('/:id/mark-received', (req, res) => {
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
  const selectQuery = 'SELECT * FROM scheduled_receipts WHERE id = ?';
  
  req.db.query(selectQuery, [id], (err, orderResults) => {
    if (err) {
      console.error('入荷予定確認エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '入荷予定の確認に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (orderResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された入荷予定が見つかりません'
      });
    }
    
    const currentOrder = orderResults[0];
    
    // 入荷予定状態のみ処理可能
    if (currentOrder.status !== '入荷予定') {
      return res.status(400).json({
        success: false,
        message: `ステータスが「入荷予定」の発注のみ入荷処理できます（現在: ${currentOrder.status}）`
      });
    }
    
    // 予定入荷を入荷済みに更新
    const updateQuery = `
      UPDATE scheduled_receipts 
      SET 
        status = '入荷済み',
        remarks = CONCAT(COALESCE(remarks, ''), '\n入荷実績: ', ?, '個 (', ?, ')'),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    req.db.query(updateQuery, [actual_quantity, receipt_date, remarks || '入荷完了', id], (err, updateResult) => {
      if (err) {
        console.error('入荷実績処理エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '入荷実績処理に失敗しました',
          error: err.message
        });
        return;
      }
      
      // 更新後の情報を取得
      const getUpdatedQuery = `
        SELECT 
          sr.*,
          p.specification
        FROM scheduled_receipts sr
        JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.id = ?
      `;
      
      req.db.query(getUpdatedQuery, [id], (err, updatedOrder) => {
        if (err) {
          console.error('更新データ取得エラー:', err.message);
          res.status(500).json({
            success: false,
            message: '更新データの取得に失敗しました',
            error: err.message
          });
          return;
        }
        
        res.json({
          success: true,
          message: '入荷実績を反映しました',
          data: updatedOrder[0],
          note: '在庫数量の更新は /api/inventory/{part_code}/receipt で別途実行してください'
        });
      });
    });
  });
});

/**
 * 発注キャンセル
 * PUT /api/scheduled-receipts/:id/cancel
 * Body: {
 *   reason?: string
 * }
 */
router.put('/:id/cancel', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  // 現在の発注状態を確認
  const selectQuery = 'SELECT * FROM scheduled_receipts WHERE id = ?';
  
  req.db.query(selectQuery, [id], (err, orderResults) => {
    if (err) {
      console.error('発注状態確認エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '発注状態の確認に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (orderResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された発注が見つかりません'
      });
    }
    
    const currentOrder = orderResults[0];
    
    // 入荷済み以外はキャンセル可能
    if (currentOrder.status === '入荷済み') {
      return res.status(400).json({
        success: false,
        message: '入荷済みの発注はキャンセルできません'
      });
    }
    
    // 発注をキャンセル状態に更新
    const updateQuery = `
      UPDATE scheduled_receipts 
      SET 
        status = 'キャンセル',
        remarks = CONCAT(COALESCE(remarks, ''), '\nキャンセル理由: ', ?),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    req.db.query(updateQuery, [reason || 'キャンセル', id], (err, updateResult) => {
      if (err) {
        console.error('発注キャンセルエラー:', err.message);
        res.status(500).json({
          success: false,
          message: '発注キャンセルに失敗しました',
          error: err.message
        });
        return;
      }
      
      // 更新後の情報を取得
      const getUpdatedQuery = `
        SELECT 
          sr.*,
          p.specification
        FROM scheduled_receipts sr
        JOIN parts p ON sr.part_code = p.part_code
        WHERE sr.id = ?
      `;
      
      req.db.query(getUpdatedQuery, [id], (err, updatedOrder) => {
        if (err) {
          console.error('更新データ取得エラー:', err.message);
          res.status(500).json({
            success: false,
            message: '更新データの取得に失敗しました',
            error: err.message
          });
          return;
        }
        
        res.json({
          success: true,
          message: '発注をキャンセルしました',
          data: updatedOrder[0]
        });
      });
    });
  });
});

/**
 * 入荷予定詳細取得
 * GET /api/scheduled-receipts/:id
 */
router.get('/:id', (req, res) => {
  const { id } = req.params;
  
  const query = `
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
  `;
  
  req.db.query(query, [id], (err, results) => {
    if (err) {
      console.error('入荷予定詳細取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '入荷予定詳細の取得に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された入荷予定が見つかりません'
      });
    }
    
    res.json({
      success: true,
      data: results[0]
    });
  });
});

module.exports = router;