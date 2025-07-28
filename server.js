const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// ルーターのインポート
const authRoutes = require('./src/routes/auth'); // 🆕 認証ルート追加
const partsRoutes = require('./src/routes/parts');
const inventoryRoutes = require('./src/routes/inventory'); 
const scheduled_receiptsRoutes = require('./src/routes/scheduled-receipts');
const availableInventoryRoutes = require('./src/routes/available-inventory');
const bommanagementRoutes = require('./src/routes/bom-management');
const production_plansRoutes = require('./src/routes/production-plans');
const stocktakingRoutes = require('./src/routes/stocktaking');
const procurementAlertsRoutes = require('./src/routes/procurement-alerts');
const reportsRoutes = require('./src/routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================
// セキュリティミドルウェア設定
// ===========================
app.use(helmet()); // 🆕 セキュリティヘッダー追加
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
})); // CORS設定強化
app.use(express.json({ limit: '10mb' })); // JSONペイロード制限

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
let connectionTestRetries = 0;
const MAX_RETRIES = 5;

const testConnection = () => {
  db.getConnection((err, connection) => {
    if (err) {
      connectionTestRetries++;
      console.error(`データベース接続エラー (${connectionTestRetries}/${MAX_RETRIES}):`, err.message);
      
      if (connectionTestRetries < MAX_RETRIES) {
        console.log(`${5}秒後に再試行します...`);
        setTimeout(testConnection, 5000);
      } else {
        console.error('データベース接続の最大リトライ回数に達しました。システムを確認してください。');
        // 本番環境では process.exit(1) も検討
      }
      return;
    }
    
    console.log('✅ MySQLに接続成功 (Connection ID:', connection.threadId, ')');
    connectionTestRetries = 0; // リトライカウンターをリセット
    
    // 基本的なテーブル存在確認
    connection.query('SELECT COUNT(*) as count FROM parts', (err, results) => {
      if (err) {
        console.error('⚠️  部品テーブル確認エラー:', err.message);
      } else {
        console.log('📦 部品マスタ件数:', results[0].count);
      }
      
      // 認証テーブル確認も追加
      connection.query('SELECT COUNT(*) as count FROM users', (err, userResults) => {
        if (err) {
          console.error('⚠️  ユーザーテーブル確認エラー:', err.message);
        } else {
          console.log('👥 ユーザー件数:', userResults[0].count);
        }
        
        // 他の重要テーブルも確認
        connection.query('SELECT COUNT(*) as count FROM inventory', (err, inventoryResults) => {
          if (err) {
            console.error('⚠️  在庫テーブル確認エラー:', err.message);
          } else {
            console.log('📋 在庫管理件数:', inventoryResults[0].count);
          }
          
          connection.release();
          console.log('🚀 システム準備完了');
          console.log('🔐 認証機能が有効になりました');
        });
      });
    });
  });
};

// 初回接続テスト実行
testConnection();

// ===========================
// ルーターの設定
// ===========================

// 基本ルート（認証不要）
app.get('/', (req, res) => {
  res.json({ 
    message: '在庫管理システムAPI',
    status: 'running',
    version: '1.0.0',
    authentication: 'enabled', // 🆕 認証機能有効化表示
    endpoints: {
      health: '/api/health',
      auth: {
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        me: 'GET /api/auth/me',
        changePassword: 'PUT /api/auth/change-password'
      },
      api: {
        parts: '/api/parts',
        inventory: '/api/inventory',
        scheduled_receipts: '/api/scheduled-receipts',
        available_inventory: '/api/available-inventory',
        bom: '/api/bom',
        plans: '/api/plans',
        stocktaking: '/api/stocktaking',
        alerts: '/api/alerts',
        reports: '/api/reports'
      }
    },
    defaultCredentials: { // 🆕 開発用認証情報表示
      admin: { username: 'admin', password: 'admin123' },
      production: { username: 'production_mgr', password: 'prod123' },
      material: { username: 'material_staff', password: 'material123' },
      viewer: { username: 'viewer_user', password: 'viewer123' }
    },
    timestamp: new Date().toISOString()
  });
});

// ヘルスチェックエンドポイント（認証不要）
app.get('/api/health', (req, res) => {
  const startTime = Date.now();
  
  db.getConnection((err, connection) => {
    if (err) {
      console.error('ヘルスチェック - 接続エラー:', err.message);
      res.status(500).json({ 
        status: 'error', 
        message: 'データベース接続エラー',
        error: err.message,
        timestamp: new Date().toISOString()
      });
      return;
    }
    
    connection.query('SELECT 1 as test, NOW() as db_time', (err, results) => {
      const responseTime = Date.now() - startTime;
      connection.release();
      
      if (err) {
        console.error('ヘルスチェック - クエリエラー:', err.message);
        res.status(500).json({ 
          status: 'error', 
          message: 'データベースクエリエラー',
          error: err.message,
          response_time_ms: responseTime,
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      res.json({ 
        status: 'ok', 
        database: 'connected',
        authentication: 'enabled', // 🆕 認証状態表示
        db_time: results[0].db_time,
        response_time_ms: responseTime,
        timestamp: new Date().toISOString(),
        test_result: results[0].test
      });
    });
  });
});

// ===========================
// APIルートを設定
// ===========================

// 🆕 認証関連ルート（認証不要 - ログイン自体は認証前なので）
app.use('/api/auth', authRoutes);

// 既存APIルート（この後の段階で認証を追加予定）
app.use('/api/parts', partsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/scheduled-receipts', scheduled_receiptsRoutes);
app.use('/api/available-inventory', availableInventoryRoutes);
app.use('/api/bom', bommanagementRoutes);
app.use('/api/plans', production_plansRoutes);
app.use('/api/stocktaking', stocktakingRoutes);
app.use('/api/procurement-alerts', procurementAlertsRoutes);
app.use('/api/reports', reportsRoutes);


// 404エラーハンドリング
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'エンドポイントが見つかりません',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// グローバルエラーハンドリング
app.use((error, req, res, next) => {
  console.error('グローバルエラー:', error);
  res.status(500).json({
    success: false,
    message: 'サーバー内部エラーが発生しました',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 サーバーがポート${PORT}で起動しました`);
  console.log(`🔗 アクセスURL: http://localhost:${PORT}`);
  console.log(`❤️  ヘルスチェック: http://localhost:${PORT}/api/health`);
  console.log(`🔐 ログインAPI: http://localhost:${PORT}/api/auth/login`);
  console.log(`📋 利用可能なAPIエンドポイント一覧: http://localhost:${PORT}/`);
});

// エラーハンドリング
process.on('SIGINT', () => {
  console.log('\n🛑 サーバーを停止します...');
  db.end(() => {
    console.log('💾 データベース接続を閉じました');
    process.exit(0);
  });
});

// 未処理例外のキャッチ（本番環境用）
process.on('uncaughtException', (err) => {
  console.error('未処理例外:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('未処理Rejection:', reason);
});

module.exports = app;