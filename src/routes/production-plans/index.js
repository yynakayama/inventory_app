// ==========================================
// 生産計画管理 - メインルーター
// File: routes/production-plans/index.js
// ==========================================

const express = require('express');
const router = express.Router();

// 機能別モジュールをインポート
const crudOperations = require('./crud-operations');
const requirementsCalculator = require('./requirements-calculator');
// reservation-managerは直接使用しないが、crud-operationsが依存するため存在確認
const reservationManager = require('./reservation-manager');

// ==========================================
// ルート定義
// 既存のAPIエンドポイントを完全維持
// ==========================================

// 基本CRUD操作のルートを結合
router.use('/', crudOperations);

// 所要量計算機能のルートを結合
router.use('/', requirementsCalculator);

// ==========================================
// ルート情報の出力（開発用）
// ==========================================
if (process.env.NODE_ENV === 'development') {
    console.log('📋 生産計画API ルート情報:');
    console.log('  GET    /api/plans                     - 生産計画一覧取得');
    console.log('  GET    /api/plans/:id                 - 生産計画詳細取得');
    console.log('  POST   /api/plans                     - 生産計画登録（自動予約付き）');
    console.log('  PUT    /api/plans/:id                 - 生産計画更新（予約更新付き）');
    console.log('  DELETE /api/plans/:id                 - 生産計画削除（予約解除付き）');
    console.log('  GET    /api/plans/status/:status      - ステータス別取得');
    console.log('  POST   /api/plans/:id/requirements    - 所要量計算');
}

module.exports = router;

module.exports = router;