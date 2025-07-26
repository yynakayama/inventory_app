const express = require('express');
const router = express.Router();
const { authenticateToken, requireMaterialAccess, requireReadAccess } = require('../middleware/auth');

/**
 * 在庫一覧取得API
 * GET /api/inventory
 * 権限: 全認証ユーザー（参照権限）
 * クエリパラメータ:
 * - search: 部品コード・仕様での検索
 * - category: カテゴリでのフィルタ
 * - low_stock: 安全在庫を下回る部品のみ表示
 */
router.get('/', authenticateToken, requireReadAccess, (req, res) => {
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
  
  req.db.query(sql, params, (err, results) => {
    if (err) {
      console.error('在庫一覧取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: 'サーバーエラーが発生しました',
        error: err.message
      });
      return;
    }
    
    res.json({
      success: true,
      data: results,
      total: results.length,
      // 認証ユーザー情報を追加（デバッグ用）
      user_info: {
        user_id: req.user.user_id,
        role: req.user.role
      }
    });
  });
});

/**
 * 特定部品の在庫詳細取得API
 * GET /api/inventory/:part_code
 * 権限: 全認証ユーザー（参照権限）
 */
router.get('/:part_code', authenticateToken, requireReadAccess, (req, res) => {
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
  
  req.db.query(sql, [part_code], (err, results) => {
    if (err) {
      console.error('在庫詳細取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: 'サーバーエラーが発生しました',
        error: err.message
      });
      return;
    }
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品の在庫情報が見つかりません'
      });
    }
    
    res.json({
      success: true,
      data: results[0]
    });
  });
});

/**
 * 在庫数量更新API（手動調整）
 * PUT /api/inventory/:part_code
 * 権限: admin + material_staff（資材管理権限）
 * Body: { current_stock: number, reason?: string }
 */
router.put('/:part_code', authenticateToken, requireMaterialAccess, (req, res) => {
  const { part_code } = req.params;
  const { current_stock, reason = '手動調整' } = req.body;
  
  // バリデーション
  if (typeof current_stock !== 'number' || current_stock < 0) {
    return res.status(400).json({
      success: false,
      message: '在庫数量は0以上の数値で入力してください'
    });
  }
  
  // 現在の在庫情報を取得
  const getCurrentQuery = 'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?';
  
  req.db.query(getCurrentQuery, [part_code], (err, currentResults) => {
    if (err) {
      console.error('現在在庫取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '現在在庫の取得に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (currentResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品が見つかりません'
      });
    }
    
    const oldStock = currentResults[0].current_stock;
    const reservedStock = currentResults[0].reserved_stock;
    
    // 在庫マイナス防止チェック（予約在庫考慮）
    if (current_stock < reservedStock) {
      return res.status(400).json({
        success: false,
        message: `在庫数量は予約済み在庫（${reservedStock}）以上である必要があります`
      });
    }
    
    // 在庫数量を更新
    const updateQuery = 'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?';
    
    req.db.query(updateQuery, [current_stock, part_code], (err, updateResult) => {
      if (err) {
        console.error('在庫更新エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '在庫更新に失敗しました',
          error: err.message
        });
        return;
      }
      
      // 在庫履歴を記録（認証ユーザー情報を記録）
      const stockDifference = current_stock - oldStock;
      const historyQuery = `
        INSERT INTO inventory_transactions 
        (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
      `;
      
      const historyRemarks = `${reason} (実行者: ${req.user.username})`;
      
      req.db.query(historyQuery, [part_code, '手動調整', stockDifference, oldStock, current_stock, historyRemarks, req.user.user_id], (err, historyResult) => {
        if (err) {
          console.error('履歴記録エラー:', err.message);
          // 履歴記録エラーは警告のみ、レスポンスは正常とする
          console.warn('在庫履歴の記録に失敗しましたが、在庫更新は完了しました');
        }
        
        res.json({
          success: true,
          message: '在庫数量を更新しました',
          data: {
            part_code,
            old_stock: oldStock,
            new_stock: current_stock,
            difference: stockDifference,
            updated_by: req.user.username
          }
        });
      });
    });
  });
});

/**
 * 入荷処理API
 * POST /api/inventory/:part_code/receipt
 * 権限: admin + material_staff（資材管理権限）
 * Body: { quantity: number, supplier?: string, remarks?: string }
 */
router.post('/:part_code/receipt', authenticateToken, requireMaterialAccess, (req, res) => {
  const { part_code } = req.params;
  const { quantity, supplier = '', remarks = '' } = req.body;
  
  // バリデーション
  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: '入荷数量は1以上の数値で入力してください'
    });
  }
  
  // 部品マスタの存在確認
  const partCheckQuery = 'SELECT part_code FROM parts WHERE part_code = ? AND is_active = true';
  
  req.db.query(partCheckQuery, [part_code], (err, partResults) => {
    if (err) {
      console.error('部品存在確認エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '部品存在確認に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (partResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品が見つかりません'
      });
    }
    
    // 在庫レコードの存在確認・作成
    const inventoryCheckQuery = 'SELECT current_stock FROM inventory WHERE part_code = ?';
    
    req.db.query(inventoryCheckQuery, [part_code], (err, inventoryResults) => {
      if (err) {
        console.error('在庫確認エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '在庫確認に失敗しました',
          error: err.message
        });
        return;
      }
      
      let currentStock = 0;
      
      if (inventoryResults.length === 0) {
        // 在庫レコードが存在しない場合は新規作成
        const createInventoryQuery = 'INSERT INTO inventory (part_code, current_stock, reserved_stock, updated_at) VALUES (?, 0, 0, NOW())';
        
        req.db.query(createInventoryQuery, [part_code], (err, createResult) => {
          if (err) {
            console.error('在庫レコード作成エラー:', err.message);
            res.status(500).json({
              success: false,
              message: '在庫レコードの作成に失敗しました',
              error: err.message
            });
            return;
          }
          
          // 作成後、入荷処理を実行
          processReceipt(part_code, quantity, 0, supplier, remarks, req, res);
        });
      } else {
        currentStock = inventoryResults[0].current_stock;
        // 既存レコードがある場合、入荷処理を実行
        processReceipt(part_code, quantity, currentStock, supplier, remarks, req, res);
      }
    });
  });
});

/**
 * 入荷処理の実行部分（内部関数）
 * 認証ユーザー情報を履歴に記録
 */
function processReceipt(part_code, quantity, currentStock, supplier, remarks, req, res) {
  const newStock = currentStock + quantity;
  
  // 在庫数量を更新
  const updateQuery = 'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?';
  
  req.db.query(updateQuery, [newStock, part_code], (err, updateResult) => {
    if (err) {
      console.error('在庫更新エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '在庫更新に失敗しました',
        error: err.message
      });
      return;
    }
    
    // 在庫トランザクション履歴を記録（認証ユーザー情報を含む）
    const historyQuery = `
      INSERT INTO inventory_transactions 
      (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
      VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
    `;
    
    const historyRemarks = `入荷処理: ${remarks}${supplier ? ` (仕入先: ${supplier})` : ''} (実行者: ${req.user.username})`;
    
    req.db.query(historyQuery, [part_code, '入荷', quantity, currentStock, newStock, historyRemarks, req.user.user_id], (err, historyResult) => {
      if (err) {
        console.error('履歴記録エラー:', err.message);
        // 履歴記録エラーは警告のみ
        console.warn('入荷履歴の記録に失敗しましたが、入荷処理は完了しました');
      }
      
      res.json({
        success: true,
        message: '入荷処理が完了しました',
        data: {
          part_code,
          receipt_quantity: quantity,
          old_stock: currentStock,
          new_stock: newStock,
          supplier,
          processed_by: req.user.username
        }
      });
    });
  });
}

/**
 * 出庫処理API
 * POST /api/inventory/:part_code/issue
 * 権限: admin + material_staff（資材管理権限）
 * Body: { quantity: number, purpose?: string, remarks?: string }
 */
router.post('/:part_code/issue', authenticateToken, requireMaterialAccess, (req, res) => {
  const { part_code } = req.params;
  const { quantity, purpose = '生産投入', remarks = '' } = req.body;
  
  // バリデーション
  if (typeof quantity !== 'number' || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: '出庫数量は1以上の数値で入力してください'
    });
  }
  
  // 現在の在庫情報を取得
  const getCurrentQuery = 'SELECT current_stock, reserved_stock FROM inventory WHERE part_code = ?';
  
  req.db.query(getCurrentQuery, [part_code], (err, inventoryResults) => {
    if (err) {
      console.error('在庫情報取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: '在庫情報の取得に失敗しました',
        error: err.message
      });
      return;
    }
    
    if (inventoryResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: '指定された部品の在庫情報が見つかりません'
      });
    }
    
    const currentStock = inventoryResults[0].current_stock;
    const reservedStock = inventoryResults[0].reserved_stock;
    const availableStock = currentStock - reservedStock;
    
    // 在庫不足チェック
    if (quantity > availableStock) {
      return res.status(400).json({
        success: false,
        message: `利用可能在庫が不足しています（利用可能: ${availableStock}、要求: ${quantity}）`
      });
    }
    
    const newStock = currentStock - quantity;
    
    // 在庫数量を更新
    const updateQuery = 'UPDATE inventory SET current_stock = ?, updated_at = NOW() WHERE part_code = ?';
    
    req.db.query(updateQuery, [newStock, part_code], (err, updateResult) => {
      if (err) {
        console.error('在庫更新エラー:', err.message);
        res.status(500).json({
          success: false,
          message: '在庫更新に失敗しました',
          error: err.message
        });
        return;
      }
      
      // 在庫トランザクション履歴を記録（認証ユーザー情報を含む）
      const historyQuery = `
        INSERT INTO inventory_transactions 
        (part_code, transaction_type, quantity, before_stock, after_stock, remarks, transaction_date, created_by) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)
      `;
      
      const historyRemarks = `${purpose}: ${remarks} (実行者: ${req.user.username})`;
      
      req.db.query(historyQuery, [part_code, '出庫', -quantity, currentStock, newStock, historyRemarks, req.user.user_id], (err, historyResult) => {
        if (err) {
          console.error('履歴記録エラー:', err.message);
          // 履歴記録エラーは警告のみ
          console.warn('出庫履歴の記録に失敗しましたが、出庫処理は完了しました');
        }
        
        res.json({
          success: true,
          message: '出庫処理が完了しました',
          data: {
            part_code,
            issue_quantity: quantity,
            old_stock: currentStock,
            new_stock: newStock,
            available_stock: availableStock - quantity,
            purpose,
            processed_by: req.user.username
          }
        });
      });
    });
  });
});

/**
 * 在庫履歴取得API
 * GET /api/inventory/:part_code/history
 * 権限: 全認証ユーザー（参照権限）
 */
router.get('/:part_code/history', authenticateToken, requireReadAccess, (req, res) => {
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
  
  req.db.query(sql, [part_code, parseInt(limit)], (err, results) => {
    if (err) {
      console.error('在庫履歴取得エラー:', err.message);
      res.status(500).json({
        success: false,
        message: 'サーバーエラーが発生しました',
        error: err.message
      });
      return;
    }
    
    res.json({
      success: true,
      data: results,
      total: results.length
    });
  });
});

module.exports = router;