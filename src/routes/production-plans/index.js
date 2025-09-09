// ==========================================
// 生産計画管理 - メインルーター
// ファイル: src/routes/production-plans/index.js
// 目的: 生産計画機能の認証・ルーティング管理
// ==========================================

const express = require('express');
const mysql = require('mysql2/promise');
const { 
    authenticateToken, 
    requireReadAccess, 
    requireProductionAccess 
} = require('../../middleware/auth');

const router = express.Router();

// データベース接続設定
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'inventory_db',
    charset: 'utf8mb4'
};

// 機能別モジュールをインポート
const crudOperations = require('./crud-operations');
const requirementsCalculator = require('./requirements-calculator');
const reservationManager = require('./reservation-manager');
const productionConsumption = require('./production-consumption');

// ==========================================
// 認証ミドルウェアを全ルートに適用
// ==========================================

// 全ての生産計画APIには認証が必要
router.use(authenticateToken);

// ==========================================
// データベース接続をリクエストに注入するミドルウェア
// ==========================================
router.use(async (req, res, next) => {
    // データベース設定をリクエストオブジェクトに注入
    req.dbConfig = dbConfig;
    req.mysql = mysql;
    next();
});

// ==========================================
// ルート定義（権限別）
// ==========================================

// 【参照系】全認証ユーザーがアクセス可能
// GET /api/plans - 生産計画一覧取得
// GET /api/plans/:id - 生産計画詳細取得  
// GET /api/plans/status/:status - ステータス別生産計画取得
// POST /api/plans/:id/requirements - 所要量計算（参照のみなので全ユーザー可）
router.use('/', crudOperations);
router.use('/', requirementsCalculator);

// 【生産管理系】生産管理権限が必要
// POST /api/plans/:id/start-production - 生産開始・部材消費
// POST /api/plans/:id/complete-production - 生産完了
router.use('/', productionConsumption);

// ==========================================
// ルート情報の出力（開発用）
// ==========================================
if (process.env.NODE_ENV === 'development') {
    console.log('📋 生産計画API ルート情報（データベース接続統一版）:');
    console.log('  【参照系】全認証ユーザー可:');
    console.log('    GET    /api/plans                     - 生産計画一覧取得');
    console.log('    GET    /api/plans/:id                 - 生産計画詳細取得');
    console.log('    GET    /api/plans/status/:status      - ステータス別取得');
    console.log('    POST   /api/plans/:id/requirements    - 所要量計算');
    console.log('  【更新系】生産管理権限必要（admin, production_manager）:');
    console.log('    POST   /api/plans                     - 生産計画登録（自動予約付き）');
    console.log('    PUT    /api/plans/:id                 - 生産計画更新（予約更新付き）');
    console.log('    DELETE /api/plans/:id                 - 生産計画削除（予約解除付き）');
    console.log('    POST   /api/plans/:id/start-production   - 生産開始・部材消費');
    console.log('    POST   /api/plans/:id/complete-production - 生産完了');
    console.log('');
    console.log('  🔐 認証要件:');
    console.log('    - 全API: JWT認証必須');
    console.log('    - 参照系: 全ロール可（admin, production_manager, material_staff, viewer）');
    console.log('    - 更新系: 生産管理権限のみ（admin, production_manager）');
    console.log('');
    console.log('  🗄️ データベース接続: mysql2/promise (統一版)');
}

module.exports = router;