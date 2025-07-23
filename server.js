const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

// ルーターのインポート
const partsRoutes = require('./src/routes/parts');
const inventoryRoutes = require('./src/routes/inventory'); 
const scheduled_receiptsRoutes = require('./src/routes/scheduled-receipts');
const availableInventoryRoutes = require('./src/routes/available-inventory');


const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors());
app.use(express.json());

// MySQL接続設定（プール使用）
const dbConfig = {
  host: process.env.DB_HOST || 'mysql',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_NAME || 'inventory_db',
  connectionLimit: 10,
  acquireTimeout: 60000,
  timeout: 60000,
  ssl: false,
  reconnect: true,
  timezone: '+09:00'
};

console.log('データベース接続設定:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  database: dbConfig.database
});

const db = mysql.createPool(dbConfig);

// データベース接続をミドルウェアとして提供
app.use((req, res, next) => {
  req.db = db;
  next();
});

// データベース接続テスト
const testConnection = () => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error('データベース接続エラー:', err.message);
      setTimeout(testConnection, 5000);
      return;
    }
    
    console.log('MySQLに接続しました (Connection ID:', connection.threadId, ')');
    
    connection.query('SELECT COUNT(*) as count FROM parts', (err, results) => {
      if (err) {
        console.error('部品テーブル確認エラー:', err.message);
      } else {
        console.log('部品マスタ件数:', results[0].count);
      }
      connection.release();
    });
  });
};

testConnection();

// ===========================
// ルーターの設定
// ===========================

// 基本ルート
app.get('/', (req, res) => {
  res.json({ 
    message: '在庫管理システムAPI',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      parts: '/api/parts',
      inventory: '/api/inventory'
    },
    timestamp: new Date().toISOString()
  });
});

// ヘルスチェックエンドポイント
app.get('/api/health', (req, res) => {
  db.getConnection((err, connection) => {
    if (err) {
      console.error('ヘルスチェック - 接続エラー:', err.message);
      res.status(500).json({ 
        status: 'error', 
        message: 'データベース接続エラー',
        error: err.message
      });
      return;
    }
    
    connection.query('SELECT 1 as test', (err, results) => {
      connection.release();
      
      if (err) {
        console.error('ヘルスチェック - クエリエラー:', err.message);
        res.status(500).json({ 
          status: 'error', 
          message: 'データベースクエリエラー',
          error: err.message 
        });
        return;
      }
      
      res.json({ 
        status: 'ok', 
        database: 'connected',
        timestamp: new Date().toISOString(),
        test_result: results[0].test
      });
    });
  });
});

// 部品関連APIルートを設定
app.use('/api/parts', partsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/scheduled-receipts', scheduled_receiptsRoutes);
app.use('/api/available-inventory', availableInventoryRoutes);

// サーバー起動
app.listen(PORT, '0.0.0.0', () => {
  console.log(`サーバーがポート${PORT}で起動しました`);
  console.log(`アクセスURL: http://localhost:${PORT}`);
});

// エラーハンドリング
process.on('SIGINT', () => {
  console.log('\nサーバーを停止します...');
  db.end(() => {
    console.log('データベース接続を閉じました');
    process.exit(0);
  });
});

module.exports = app;