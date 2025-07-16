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