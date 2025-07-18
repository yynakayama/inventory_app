// ==========================================
// 部品マスタ関連APIルート
// ==========================================

const express = require('express');
const router = express.Router();

// 1. 部品一覧取得 GET /api/parts
router.get('/', (req, res) => {
  const query = `
    SELECT 
      part_code,
      part_name,
      specification,
      unit,
      lead_time_days,
      safety_stock,
      supplier,
      category,
      unit_price,
      created_at,
      updated_at
    FROM parts 
    WHERE is_active = TRUE
    ORDER BY part_code
  `;
  
  req.db.query(query, (err, results) => {
    if (err) {
      console.error('部品一覧取得エラー:', err.message);
      res.status(500).json({ 
        error: 'データベースエラー',
        message: '部品一覧の取得に失敗しました',
        details: err.message
      });
      return;
    }
    
    res.json({
      success: true,
      data: results,
      count: results.length,
      timestamp: new Date().toISOString()
    });
  });
});

// 2. 特定部品取得 GET /api/parts/:code
router.get('/:code', (req, res) => {
  const partCode = req.params.code;
  
  const query = `
    SELECT 
      part_code,
      part_name,
      specification,
      unit,
      lead_time_days,
      safety_stock,
      supplier,
      category,
      unit_price,
      created_at,
      updated_at
    FROM parts 
    WHERE part_code = ? AND is_active = TRUE
  `;
  
  req.db.query(query, [partCode], (err, results) => {
    if (err) {
      console.error('部品取得エラー:', err.message);
      res.status(500).json({ 
        error: 'データベースエラー',
        message: '部品の取得に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.length === 0) {
      res.status(404).json({
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    res.json({
      success: true,
      data: results[0]
    });
  });
});

// 3. 新規部品登録 POST /api/parts
router.post('/', (req, res) => {
  const {
    part_code,
    part_name,
    specification,
    unit = '個',
    lead_time_days = 7,
    safety_stock = 0,
    supplier,
    category = 'MECH',
    unit_price = 0.00
  } = req.body;
  
  // 必須項目チェック
  if (!part_code || !part_name) {
    res.status(400).json({
      error: '入力エラー',
      message: '部品コードと部品名は必須です'
    });
    return;
  }
  
  const query = `
    INSERT INTO parts (
      part_code,
      part_name,
      specification,
      unit,
      lead_time_days,
      safety_stock,
      supplier,
      category,
      unit_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    part_code,
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price
  ];
  
  req.db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          error: '重複エラー',
          message: `部品コード「${part_code}」は既に存在します`
        });
        return;
      }
      
      console.error('部品登録エラー:', err.message);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の登録に失敗しました',
        details: err.message
      });
      return;
    }
    
    res.status(201).json({
      success: true,
      message: '部品を登録しました',
      data: { part_code }
    });
  });
});

// 4. 部品更新 PUT /api/parts/:code
router.put('/:code', (req, res) => {
  const partCode = req.params.code;
  const {
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price
  } = req.body;
  
  // 必須項目チェック
  if (!part_name) {
    res.status(400).json({
      error: '入力エラー',
      message: '部品名は必須です'
    });
    return;
  }
  
  const query = `
    UPDATE parts SET
      part_name = ?,
      specification = ?,
      unit = ?,
      lead_time_days = ?,
      safety_stock = ?,
      supplier = ?,
      category = ?,
      unit_price = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE part_code = ? AND is_active = TRUE
  `;
  
  const values = [
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price,
    partCode
  ];
  
  req.db.query(query, values, (err, results) => {
    if (err) {
      console.error('部品更新エラー:', err.message);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の更新に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.affectedRows === 0) {
      res.status(404).json({
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    res.json({
      success: true,
      message: '部品を更新しました',
      data: { part_code: partCode }
    });
  });
});

// 5. 部品削除 DELETE /api/parts/:code（論理削除）
router.delete('/:code', (req, res) => {
  const partCode = req.params.code;
  
  const query = `
    UPDATE parts SET 
      is_active = FALSE,
      updated_at = CURRENT_TIMESTAMP
    WHERE part_code = ? AND is_active = TRUE
  `;
  
  req.db.query(query, [partCode], (err, results) => {
    if (err) {
      console.error('部品削除エラー:', err.message);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の削除に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.affectedRows === 0) {
      res.status(404).json({
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    res.json({
      success: true,
      message: '部品を削除しました',
      data: { part_code: partCode }
    });
  });
});

module.exports = router;