# 権限管理ガイド

## 概要

このシステムでは、マスタ管理以外のページは全ユーザーが閲覧可能で、ページ内の編集操作は権限のある者のみに制限されています。

## 権限レベル

### 1. 閲覧者 (viewer)
- 全ページの閲覧が可能
- 編集操作は不可

### 2. 資材担当 (material_staff)
- 在庫管理の編集権限
- 調達管理の編集権限
- 全ページの閲覧権限

### 3. 生産管理者 (production_manager)
- 生産計画の編集権限
- 調達管理の編集権限
- 全ページの閲覧権限

### 4. 管理者 (admin)
- 全機能の編集権限
- マスタ管理の閲覧・編集権限

## 実装された権限制御

### ナビゲーション
- **マスタ管理**: 管理者のみ表示
- **その他のページ**: 全ユーザー表示

### 在庫管理 (`/inventory/list`)
- **閲覧**: 全ユーザー
- **棚卸機能**: 管理者・資材担当のみ

### 生産計画 (`/production/plans`)
- **閲覧**: 全ユーザー
- **新規作成・編集**: 管理者・生産管理者のみ

### 調達管理 (`/procurement/scheduled`)
- **閲覧**: 全ユーザー
- **新規発注・納期設定・入荷処理**: 管理者・資材担当・生産管理者のみ

## 使用可能なコンポーネント

### 権限チェックコンポーネント

```tsx
import { 
  InventoryEditGuard, 
  ProductionEditGuard, 
  ProcurementEditGuard,
  AdminOnly 
} from '@/components/guards/PermissionGuard'

// 在庫編集権限
<InventoryEditGuard>
  <button>棚卸実行</button>
</InventoryEditGuard>

// 生産計画編集権限
<ProductionEditGuard>
  <button>新規作成</button>
</ProductionEditGuard>

// 調達編集権限
<ProcurementEditGuard>
  <button>新規発注</button>
</ProcurementEditGuard>

// 管理者のみ
<AdminOnly>
  <button>マスタ管理</button>
</AdminOnly>
```

### 権限チェックフック

```tsx
import { usePermissionCheck } from '@/components/guards/PermissionGuard'

function MyComponent() {
  const { 
    canEditInventory,
    canEditProduction,
    canEditProcurement,
    isAdmin 
  } = usePermissionCheck()

  return (
    <div>
      {canEditInventory && <button>在庫編集</button>}
      {canEditProduction && <button>生産計画編集</button>}
      {canEditProcurement && <button>調達編集</button>}
      {isAdmin && <button>管理者機能</button>}
    </div>
  )
}
```

## 権限設定の変更方法

### 1. 新しい権限を追加

`frontend/src/components/guards/PermissionGuard.tsx` の `OPERATION_PERMISSIONS` に追加：

```tsx
const OPERATION_PERMISSIONS = {
  // 既存の権限...
  'new.operation': ['admin', 'production_manager'] as UserRole[],
} as const
```

### 2. 新しい権限ガードコンポーネントを作成

```tsx
export function NewOperationGuard({ children, fallback }: { children: ReactNode, fallback?: ReactNode }) {
  return (
    <PermissionGuard requiredPermissions={['new.operation']} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}
```

### 3. フックに新しいメソッドを追加

```tsx
return {
  // 既存のメソッド...
  canNewOperation: () => checkPermission('new.operation'),
}
```

## テスト方法

### 1. 異なるロールでログイン
- 各ロールでログインして、適切な権限が適用されているか確認
- 編集ボタンが権限に応じて表示/非表示されるか確認

### 2. 権限のない操作を試行
- 権限のないユーザーで編集操作を試行
- 適切にエラーハンドリングされるか確認

## 注意事項

1. **フロントエンド権限チェック**: セキュリティのため、バックエンドでも権限チェックを実装してください
2. **権限の一貫性**: フロントエンドとバックエンドで権限設定を一致させてください
3. **ユーザビリティ**: 権限のない機能は非表示にするか、適切なメッセージを表示してください

## 今後の拡張

- より細かい権限設定（ページ単位、機能単位）
- 動的権限管理
- 権限の継承機能
- 権限変更の監査ログ
