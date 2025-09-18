# マスター管理機能 API設計書

## 📋 概要

本ドキュメントは、在庫管理システムのマスター管理機能で使用するAPIエンドポイントの詳細仕様を定義します。
既存のAPIを活用しつつ、未実装のユーザー管理APIを新規追加します。

### 対象機能
- **部品マスター管理**: 既存API活用 (`/api/parts`)
- **製品・BOMマスター管理**: 既存API活用 (`/api/bom`)
- **ユーザーマスター管理**: 新規API実装 (`/api/users`)

---

## 🔐 認証・権限設計

### 権限レベル
- `admin`: 全マスター管理権限
- `production_manager`: 部品・製品・BOM管理権限（ユーザー管理は不可）
- `material_staff`: 部品管理権限のみ（参照のみ）
- `viewer`: 全マスター参照権限のみ

### 権限マトリックス
| 機能 | admin | production_manager | material_staff | viewer |
|------|-------|-------------------|----------------|--------|
| 部品マスター参照 | ✅ | ✅ | ✅ | ✅ |
| 部品マスター編集 | ✅ | ✅ | ❌ | ❌ |
| 製品・BOM参照 | ✅ | ✅ | ❌ | ✅ |
| 製品・BOM編集 | ✅ | ✅ | ❌ | ❌ |
| ユーザー管理 | ✅ | ❌ | ❌ | ❌ |

---

## 📦 1. 部品マスター管理API（既存）

### 基本情報
- **ベースURL**: `/api/parts`
- **実装状況**: ✅ 完了
- **ファイル**: `src/routes/parts.js`

### エンドポイント一覧

#### 1.1 部品一覧取得
```http
GET /api/parts
```

**権限**: 全ユーザー（認証必須）

**クエリパラメータ**:
- `search` (string, optional): 部品コードまたは仕様での検索
- `category` (string, optional): カテゴリフィルター
- `limit` (number, optional): 取得件数制限（デフォルト: 100, 最大: 1000）

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "part_code": "MECH-001",
      "specification": "M6ボルト 20mm",
      "unit": "個",
      "lead_time_days": 7,
      "safety_stock": 100,
      "supplier": "ABC商事",
      "category": "MECH",
      "unit_price": 50.00,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1,
  "message": "部品一覧を1件取得しました"
}
```

#### 1.2 部品詳細取得
```http
GET /api/parts/:code
```

**権限**: 全ユーザー（認証必須）

#### 1.3 部品新規登録
```http
POST /api/parts
```

**権限**: 管理者のみ

**リクエストボディ**:
```json
{
  "part_code": "MECH-002",
  "specification": "M8ボルト 25mm",
  "unit": "個",
  "lead_time_days": 7,
  "safety_stock": 50,
  "supplier": "XYZ商事",
  "category": "MECH",
  "unit_price": 75.00,
  "remarks": "備考"
}
```

#### 1.4 部品更新
```http
PUT /api/parts/:code
```

**権限**: 管理者のみ

#### 1.5 部品削除（論理削除）
```http
DELETE /api/parts/:code
```

**権限**: 管理者のみ

#### 1.6 部品カテゴリ一覧取得
```http
GET /api/parts/categories
```

**権限**: 認証不要

---

## 🏭 2. 製品・BOMマスター管理API（既存）

### 基本情報
- **ベースURL**: `/api/bom`
- **実装状況**: ✅ 完了
- **ファイル**: `src/routes/bom-management.js`

### エンドポイント一覧

#### 2.1 製品一覧取得
```http
GET /api/bom/products
```

**権限**: 全ユーザー（認証必須）

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "product_code": "PROD-001",
      "remarks": "製品A",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1,
  "message": "製品一覧を取得しました (1件)"
}
```

#### 2.2 製品新規作成
```http
POST /api/bom/products
```

**権限**: 生産管理権限（admin, production_manager）

**リクエストボディ**:
```json
{
  "product_code": "PROD-002",
  "remarks": "製品B"
}
```

#### 2.3 製品の工程一覧取得
```http
GET /api/bom/products/:productCode/stations
```

**権限**: 全ユーザー（認証必須）

#### 2.4 工程の使用部品一覧取得
```http
GET /api/bom/products/:productCode/stations/:stationCode/parts
```

**権限**: 全ユーザー（認証必須）

#### 2.5 BOM項目追加
```http
POST /api/bom/items
```

**権限**: 生産管理権限（admin, production_manager）

**リクエストボディ**:
```json
{
  "product_code": "PROD-001",
  "station_code": "ST-001",
  "part_code": "MECH-001",
  "quantity": 2,
  "remarks": "備考"
}
```

#### 2.6 BOM項目更新
```http
PUT /api/bom/items/:id
```

**権限**: 生産管理権限（admin, production_manager）

#### 2.7 BOM項目削除
```http
DELETE /api/bom/items/:id
```

**権限**: 生産管理権限（admin, production_manager）

#### 2.8 全工程一覧取得
```http
GET /api/bom/stations
```

**権限**: 全ユーザー（認証必須）

---

## 👥 3. ユーザーマスター管理API（新規実装）

### 基本情報
- **ベースURL**: `/api/users`
- **実装状況**: ❌ 未実装（要新規作成）
- **ファイル**: `src/routes/users.js`（新規作成）

### エンドポイント一覧

#### 3.1 ユーザー一覧取得
```http
GET /api/users
```

**権限**: 管理者のみ

**クエリパラメータ**:
- `search` (string, optional): ユーザー名またはメールアドレスでの検索
- `role` (string, optional): 権限レベルでのフィルター
- `is_active` (boolean, optional): アクティブ状態でのフィルター
- `limit` (number, optional): 取得件数制限（デフォルト: 50, 最大: 200）

**レスポンス例**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@example.com",
      "role": "admin",
      "is_active": true,
      "last_login_at": "2024-01-01T10:00:00.000Z",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1,
  "message": "ユーザー一覧を1件取得しました"
}
```

#### 3.2 ユーザー詳細取得
```http
GET /api/users/:id
```

**権限**: 管理者のみ

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "role": "admin",
    "is_active": true,
    "last_login_at": "2024-01-01T10:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  },
  "message": "ユーザー詳細を取得しました"
}
```

#### 3.3 ユーザー新規作成
```http
POST /api/users
```

**権限**: 管理者のみ

**リクエストボディ**:
```json
{
  "username": "new_user",
  "email": "newuser@example.com",
  "password": "password123",
  "role": "material_staff",
  "is_active": true
}
```

**注意**: `email`は省略可能です。省略した場合はnullで保存されます。

**バリデーション**:
- `username`: 必須、3-50文字、英数字とアンダースコアのみ、重複不可
- `email`: オプション、有効なメール形式、重複不可（設定時のみ）
- `password`: 必須、8文字以上
- `role`: 必須、enum値（admin, production_manager, material_staff, viewer）
- `is_active`: オプション、デフォルト true

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "id": 5,
    "username": "new_user",
    "email": "newuser@example.com",
    "role": "material_staff",
    "is_active": true,
    "created_by": "admin"
  },
  "message": "ユーザーを作成しました"
}
```

#### 3.4 ユーザー更新
```http
PUT /api/users/:id
```

**権限**: 管理者のみ

**リクエストボディ**:
```json
{
  "email": "updated@example.com",
  "role": "production_manager",
  "is_active": false
}
```

**注意**: `email`はnullに設定することも可能です（空文字列を送信）。

**注意事項**:
- `username`は更新不可
- `password`は別エンドポイントで管理
- 自分自身のアカウントの`role`や`is_active`は変更不可

#### 3.5 ユーザー削除（論理削除）
```http
DELETE /api/users/:id
```

**権限**: 管理者のみ

**注意事項**:
- 自分自身のアカウントは削除不可
- 論理削除（is_active = false）で実装

#### 3.6 ユーザーパスワードリセット
```http
PUT /api/users/:id/reset-password
```

**権限**: 管理者のみ

**リクエストボディ**:
```json
{
  "new_password": "newpassword123"
}
```

**レスポンス例**:
```json
{
  "success": true,
  "message": "パスワードをリセットしました",
  "data": {
    "user_id": 5,
    "username": "target_user",
    "reset_by": "admin"
  }
}
```

#### 3.7 ユーザー有効/無効切り替え
```http
PUT /api/users/:id/toggle-active
```

**権限**: 管理者のみ

**レスポンス例**:
```json
{
  "success": true,
  "data": {
    "user_id": 5,
    "username": "target_user",
    "is_active": false,
    "updated_by": "admin"
  },
  "message": "ユーザーを無効化しました"
}
```

---

## 🔧 4. 共通仕様

### 4.1 エラーレスポンス形式

#### 認証エラー（401）
```json
{
  "success": false,
  "message": "認証が必要です",
  "error": "AUTHENTICATION_REQUIRED"
}
```

#### 権限エラー（403）
```json
{
  "success": false,
  "message": "この操作を実行する権限がありません",
  "error": "INSUFFICIENT_PERMISSIONS"
}
```

#### バリデーションエラー（400）
```json
{
  "success": false,
  "message": "入力値に誤りがあります",
  "errors": [
    {
      "field": "username",
      "message": "ユーザー名は必須です"
    }
  ]
}
```

#### リソース未発見（404）
```json
{
  "success": false,
  "message": "指定されたリソースが見つかりません",
  "error": "RESOURCE_NOT_FOUND"
}
```

#### 重複エラー（409）
```json
{
  "success": false,
  "message": "同じユーザー名が既に存在します",
  "error": "DUPLICATE_ENTRY"
}
```

#### サーバーエラー（500）
```json
{
  "success": false,
  "message": "サーバー内部エラーが発生しました",
  "error": "INTERNAL_SERVER_ERROR"
}
```

### 4.2 認証ヘッダー

全ての認証が必要なエンドポイントには、以下のヘッダーが必要です：

```http
Authorization: Bearer <JWT_TOKEN>
```

### 4.3 レスポンス共通フィールド

全てのレスポンスには以下のフィールドが含まれます：

- `success` (boolean): 処理成功フラグ
- `message` (string): 処理結果メッセージ
- `data` (object|array): レスポンスデータ（成功時）
- `error` (string): エラーコード（失敗時）

---

## 📋 5. 実装優先度

### Phase 1: 高優先度（必須）
- [x] 部品マスター管理API（既存）
- [x] 製品・BOMマスター管理API（既存）
- [ ] ユーザー管理API（新規実装）
  - [ ] ユーザー一覧取得
  - [ ] ユーザー詳細取得
  - [ ] ユーザー新規作成
  - [ ] ユーザー更新
  - [ ] ユーザー有効/無効切り替え

### Phase 2: 中優先度
- [ ] ユーザーパスワードリセット
- [ ] 高度な検索・フィルタリング機能
- [ ] ページネーション対応

### Phase 3: 低優先度（将来拡張）
- [ ] ユーザーアクティビティログ
- [ ] 一括操作API
- [ ] CSV インポート/エクスポート

---

## 🚀 6. 実装ガイドライン

### 6.1 新規ファイル作成

**作成ファイル**: `src/routes/users.js`

**参考実装**: `src/routes/parts.js`の構造を参考にする

### 6.2 server.jsへの追加

```javascript
const usersRoutes = require('./src/routes/users');
app.use('/api/users', usersRoutes);
```

### 6.3 権限制御

既存の`src/middleware/auth.js`の以下の関数を使用：
- `authenticateToken`: JWT認証
- `requireAdmin`: 管理者権限チェック
- `requireReadAccess`: 参照権限チェック

### 6.4 データベース接続

既存のパターンに従い、`mysql2/promise`を使用：

```javascript
const dbConfig = {
    host: process.env.DB_HOST || 'mysql',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'inventory_db',
    charset: 'utf8mb4'
};
```

### 6.5 パスワードハッシュ化

新規ユーザー作成時は`bcrypt`を使用：

```javascript
const bcrypt = require('bcrypt');
const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
const passwordHash = await bcrypt.hash(password, saltRounds);
```

---

## ✅ 7. テスト項目

### 7.1 ユーザー管理API テスト

#### 正常系
- [ ] ユーザー一覧取得（管理者）
- [ ] ユーザー詳細取得（管理者）
- [ ] ユーザー新規作成（管理者）
- [ ] ユーザー更新（管理者）
- [ ] ユーザー無効化（管理者）

#### 異常系
- [ ] 権限なしでのアクセス（403エラー）
- [ ] 無効なユーザーIDでのアクセス（404エラー）
- [ ] 重複ユーザー名での作成（409エラー）
- [ ] バリデーションエラー（400エラー）
- [ ] 自分自身の削除試行（400エラー）

### 7.2 既存API統合テスト
- [ ] 部品マスター管理画面での既存API動作確認
- [ ] 製品・BOM管理画面での既存API動作確認
- [ ] 権限レベル別のアクセス制御確認

---

## 📝 8. 注意事項

### 8.1 セキュリティ
- パスワードは必ずハッシュ化して保存
- JWT トークンの有効期限を適切に設定
- 管理者権限の操作には特に注意深いログ出力

### 8.2 データ整合性
- ユーザー削除時は関連データの整合性を確認
- 論理削除を使用し、物理削除は避ける

### 8.3 パフォーマンス
- ユーザー一覧取得時は適切な件数制限を設ける
- 検索機能にはインデックスを活用

### 8.4 ログ出力
- 重要な操作（ユーザー作成・更新・削除）は詳細ログを出力
- 個人情報（パスワード等）はログに出力しない

---

この API設計書に基づいて、マスター管理機能の実装を進めることができます。既存のAPIは活用し、ユーザー管理APIのみ新規実装することで、効率的な開発が可能です。