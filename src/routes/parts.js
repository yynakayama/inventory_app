// ==========================================
// 部品マスタ関連APIルート
// 部品コードのみ必須、仕様は任意
// ==========================================

const express = require('express');
const { 
  authenticateToken, 
  requireAdmin, 
  requireReadAccess 
} = require('../middleware/auth');

const router = express.Router();

// ==========================================
// 認証不要エンドポイント（参照系の一部）
// ==========================================

// 1. 部品カテゴリ一覧取得 GET /api/parts/categories
// 認証不要 - システム設定情報のため
router.get('/categories', (req, res) => {
  const query = `
    SELECT 
      category_code,
      category_name,
      sort_order
    FROM part_categories 
    WHERE is_active = TRUE
    ORDER BY sort_order
  `;
  
  req.db.query(query, (err, results) => {
    if (err) {
      console.error('カテゴリ一覧取得エラー:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'データベースエラー',
        message: 'カテゴリ一覧の取得に失敗しました',
        details: err.message
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

// 2. 部品コード体系チェック GET /api/parts/code-patterns
// 認証不要 - コード命名規則の参照のため
router.get('/code-patterns', (req, res) => {
  const query = `
    SELECT 
      SUBSTRING_INDEX(part_code, '-', 1) as code_prefix,
      COUNT(*) as count,
      GROUP_CONCAT(part_code ORDER BY part_code SEPARATOR ',') as examples
    FROM parts
    WHERE is_active = TRUE
    GROUP BY SUBSTRING_INDEX(part_code, '-', 1)
    ORDER BY count DESC
  `;
  
  req.db.query(query, (err, results) => {
    if (err) {
      console.error('部品コード体系取得エラー:', err.message);
      res.status(500).json({ 
        success: false,
        error: 'データベースエラー',
        message: '部品コード体系の取得に失敗しました',
        details: err.message
      });
      return;
    }
    
    res.json({
      success: true,
      data: results,
      message: '部品コードの命名体系を表示'
    });
  });
});

// ==========================================
// 認証必要エンドポイント（要ログイン）
// ==========================================

// 3. 部品一覧取得 GET /api/parts
// 🔐 認証必須 - 全ロール参照可能
router.get('/', authenticateToken, requireReadAccess, (req, res) => {
  const { search, category, limit = 100 } = req.query;
  
  let query = `
    SELECT 
      part_code,
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
  `;
  
  const params = [];
  
  // 検索条件追加（部品コードまたは仕様での検索）
  if (search) {
    query += ` AND (part_code LIKE ? OR specification LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  
  // カテゴリフィルター
  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }
  
  query += ` ORDER BY part_code LIMIT ?`;
  params.push(parseInt(limit));
  
  req.db.query(query, params, (err, results) => {
    if (err) {
      console.error('部品一覧取得エラー:', err.message);
      res.status(500).json({ 
        success: false,
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
      search_params: { search, category, limit },
      requested_by: req.user.username, // 🆕 リクエスト者情報追加
      timestamp: new Date().toISOString()
    });
  });
});

// 4. 特定部品取得 GET /api/parts/:code
// 🔐 認証必須 - 全ロール参照可能
router.get('/:code', authenticateToken, requireReadAccess, (req, res) => {
  const partCode = req.params.code;
  
  const query = `
    SELECT 
      part_code,
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
        success: false,
        error: 'データベースエラー',
        message: '部品の取得に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.length === 0) {
      res.status(404).json({
        success: false,
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    res.json({
      success: true,
      data: results[0],
      requested_by: req.user.username // 🆕 リクエスト者情報追加
    });
  });
});

// ==========================================
// 管理者専用エンドポイント（admin のみ）
// ==========================================

// 5. 新規部品登録 POST /api/parts
// 🔐 管理者のみ - 部品マスタの追加権限
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const {
    part_code,
    specification,
    unit = '個',
    lead_time_days = 7,
    safety_stock = 0,
    supplier,
    category = 'MECH',
    unit_price = 0.00,
    remarks
  } = req.body;
  
  // 必須項目チェック（部品コードのみ）
  if (!part_code) {
    res.status(400).json({
      success: false,
      error: '入力エラー',
      message: '部品コードは必須です'
    });
    return;
  }
  
  const query = `
    INSERT INTO parts (
      part_code,
      specification,
      unit,
      lead_time_days,
      safety_stock,
      supplier,
      category,
      unit_price,
      remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    part_code,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price,
    remarks
  ];
  
  req.db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          success: false,
          error: '重複エラー',
          message: `部品コード「${part_code}」は既に存在します`
        });
        return;
      }
      
      console.error('部品登録エラー:', err.message);
      res.status(500).json({
        success: false,
        error: 'データベースエラー',
        message: '部品の登録に失敗しました',
        details: err.message
      });
      return;
    }
    
    // 🆕 操作ログ出力
    console.log(`[PARTS] 新規登録: ${part_code} by ${req.user.username} (${req.user.role})`);
    
    res.status(201).json({
      success: true,
      message: '部品を登録しました',
      data: { 
        part_code,
        created_by: req.user.username // 🆕 作成者情報追加
      }
    });
  });
});

// 6. 部品更新 PUT /api/parts/:code
// 🔐 管理者のみ - 部品マスタの編集権限
router.put('/:code', authenticateToken, requireAdmin, (req, res) => {
  const partCode = req.params.code;
  const {
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price,
    remarks
  } = req.body;
  
  // 必須項目チェック（なし - すべて任意更新）
  // 部品コードは変更不可、その他はすべて任意
  
  const query = `
    UPDATE parts SET
      specification = ?,
      unit = ?,
      lead_time_days = ?,
      safety_stock = ?,
      supplier = ?,
      category = ?,
      unit_price = ?,
      remarks = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE part_code = ? AND is_active = TRUE
  `;
  
  const values = [
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    category,
    unit_price,
    remarks,
    partCode
  ];
  
  req.db.query(query, values, (err, results) => {
    if (err) {
      console.error('部品更新エラー:', err.message);
      res.status(500).json({
        success: false,
        error: 'データベースエラー',
        message: '部品の更新に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.affectedRows === 0) {
      res.status(404).json({
        success: false,
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    // 🆕 操作ログ出力
    console.log(`[PARTS] 更新: ${partCode} by ${req.user.username} (${req.user.role})`);
    
    res.json({
      success: true,
      message: '部品を更新しました',
      data: { 
        part_code: partCode,
        updated_by: req.user.username // 🆕 更新者情報追加
      }
    });
  });
});

// 7. 部品削除 DELETE /api/parts/:code（論理削除）
// 🔐 管理者のみ - 部品マスタの削除権限
router.delete('/:code', authenticateToken, requireAdmin, (req, res) => {
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
        success: false,
        error: 'データベースエラー',
        message: '部品の削除に失敗しました',
        details: err.message
      });
      return;
    }
    
    if (results.affectedRows === 0) {
      res.status(404).json({
        success: false,
        error: '部品が見つかりません',
        message: `部品コード「${partCode}」は存在しません`
      });
      return;
    }
    
    // 🆕 操作ログ出力（重要な操作なので必ずログ）
    console.log(`[PARTS] 削除: ${partCode} by ${req.user.username} (${req.user.role})`);
    
    res.json({
      success: true,
      message: '部品を削除しました',
      data: { 
        part_code: partCode,
        deleted_by: req.user.username // 🆕 削除者情報追加
      }
    });
  });
});

module.exports = router;