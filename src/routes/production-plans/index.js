// ==========================================
// 生産計画管理 - メインルーター
// File: routes/production-plans/index.js
// ==========================================

const express = require('express');
const router = express.Router();

// 認証ミドルウェアをインポート
const { 
    authenticateToken, 
    requireReadAccess, 
    requireProductionAccess 
} = require('../../middleware/auth');

// 機能別モジュールをインポート
const crudOperations = require('./crud-operations');
const requirementsCalculator = require('./requirements-calculator');
// reservation-managerは直接使用しないが、crud-operationsが依存するため存在確認
const reservationManager = require('./reservation-manager');

// ==========================================
// 認証ミドルウェアを全ルートに適用
// ==========================================

// 全ての生産計画APIには認証が必要
router.use(authenticateToken);

// ==========================================
// ルート定義（権限別）
// ==========================================

// 【参照系】全認証ユーザーがアクセス可能
// GET /api/plans - 生産計画一覧取得
// GET /api/plans/:id - 生産計画詳細取得  
// GET /api/plans/status/:status - ステータス別生産計画取得
// POST /api/plans/:id/requirements - 所要量計算（参照のみなので全ユーザー可）
router.get('/', requireReadAccess, crudOperations);
router.get('/:id', requireReadAccess, crudOperations);
router.get('/status/:status', requireReadAccess, crudOperations);
router.post('/:id/requirements', requireReadAccess, requirementsCalculator);

// 【更新系】生産管理権限が必要（admin, production_manager）
// POST /api/plans - 生産計画登録
// PUT /api/plans/:id - 生産計画更新
// DELETE /api/plans/:id - 生産計画削除
router.post('/', requireProductionAccess, crudOperations);
router.put('/:id', requireProductionAccess, crudOperations);
router.delete('/:id', requireProductionAccess, crudOperations);

// ==========================================
// ルート情報の出力（開発用）
// ==========================================
if (process.env.NODE_ENV === 'development') {
    console.log('📋 生産計画API ルート情報（認証機能付き）:');
    console.log('  【参照系】全認証ユーザー可:');
    console.log('    GET    /api/plans                     - 生産計画一覧取得');
    console.log('    GET    /api/plans/:id                 - 生産計画詳細取得');
    console.log('    GET    /api/plans/status/:status      - ステータス別取得');
    console.log('    POST   /api/plans/:id/requirements    - 所要量計算');
    console.log('  【更新系】生産管理権限必要（admin, production_manager）:');
    console.log('    POST   /api/plans                     - 生産計画登録（自動予約付き）');
    console.log('    PUT    /api/plans/:id                 - 生産計画更新（予約更新付き）');
    console.log('    DELETE /api/plans/:id                 - 生産計画削除（予約解除付き）');
    console.log('');
    console.log('  🔐 認証要件:');
    console.log('    - 全API: JWT認証必須');
    console.log('    - 参照系: 全ロール可（admin, production_manager, material_staff, viewer）');
    console.log('    - 更新系: 生産管理権限のみ（admin, production_manager）');
}

module.exports = router;