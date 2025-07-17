const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors());
app.use(express.json());

// MySQL接続設定
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'inventory_db'
});

// データベース接続テスト
db.connect((err) => {
  if (err) {
    console.error('データベース接続エラー:', err);
    return;
  }
  console.log('MySQLに接続しました');
});

// 基本的なルート
app.get('/', (req, res) => {
  res.json({ 
    message: '在庫管理システムAPI',
    status: 'running' 
  });
});

// データベース接続確認用エンドポイント
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 as test', (err, results) => {
    if (err) {
      res.status(500).json({ 
        status: 'error', 
        message: 'データベース接続エラー' 
      });
      return;
    }
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  });
});

// ===========================
// 部品マスタ CRUD API
// ===========================

// 1. 部品一覧取得 GET /api/parts
app.get('/api/parts', (req, res) => {
  const query = `
    SELECT 
      part_code,
      part_name,
      specification,
      unit,
      lead_time_days,
      safety_stock,
      supplier,
      created_at,
      updated_at
    FROM parts 
    ORDER BY part_code
  `;
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('部品一覧取得エラー:', err);
      res.status(500).json({ 
        error: 'データベースエラー',
        message: '部品一覧の取得に失敗しました' 
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

// 2. 特定部品取得 GET /api/parts/:code
app.get('/api/parts/:code', (req, res) => {
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
      created_at,
      updated_at
    FROM parts 
    WHERE part_code = ?
  `;
  
  db.query(query, [partCode], (err, results) => {
    if (err) {
      console.error('部品取得エラー:', err);
      res.status(500).json({ 
        error: 'データベースエラー',
        message: '部品の取得に失敗しました' 
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
app.post('/api/parts', (req, res) => {
  const {
    part_code,
    part_name,
    specification,
    unit = '個',
    lead_time_days = 0,
    safety_stock = 0,
    supplier
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
      supplier
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    part_code,
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier
  ];
  
  db.query(query, values, (err, results) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({
          error: '重複エラー',
          message: `部品コード「${part_code}」は既に存在します`
        });
        return;
      }
      
      console.error('部品登録エラー:', err);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の登録に失敗しました'
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
app.put('/api/parts/:code', (req, res) => {
  const partCode = req.params.code;
  const {
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier
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
      updated_at = CURRENT_TIMESTAMP
    WHERE part_code = ?
  `;
  
  const values = [
    part_name,
    specification,
    unit,
    lead_time_days,
    safety_stock,
    supplier,
    partCode
  ];
  
  db.query(query, values, (err, results) => {
    if (err) {
      console.error('部品更新エラー:', err);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の更新に失敗しました'
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

// 5. 部品削除 DELETE /api/parts/:code
app.delete('/api/parts/:code', (req, res) => {
  const partCode = req.params.code;
  
  const query = 'DELETE FROM parts WHERE part_code = ?';
  
  db.query(query, [partCode], (err, results) => {
    if (err) {
      console.error('部品削除エラー:', err);
      res.status(500).json({
        error: 'データベースエラー',
        message: '部品の削除に失敗しました'
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

// サーバー起動
app.listen(PORT, () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
});

// エラーハンドリング
process.on('SIGINT', () => {
  console.log('\nサーバーを停止します...');
  db.end();
  process.exit(0);
});