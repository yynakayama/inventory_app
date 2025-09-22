'use client'

import { useAuth, usePermissions } from '@/providers/AuthProvider'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard, {
  AdminOnly,
  ProductionManagerOnly,
  MaterialStaffOnly,
  usePermissionCheck
} from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'

function DashboardContent() {
  const { user, logout } = useAuth()
  const { isAdmin, canManageProduction, canManageMaterial } = usePermissions()
  const {
    canViewInventory,
    canEditInventory,
    canReceiveInventory,
    canManageProduction: canManageProd,
    canManageMaster,
    isProductionManager,
    isMaterialStaff
  } = usePermissionCheck()

  const handleLogout = () => {
    logout()
  }

  return (
      <div className="space-y-8">
        {/* ユーザー情報表示 */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            ログイン情報
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">ユーザー名:</span>
              <span className="ml-2 text-gray-900">{user?.username}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">権限:</span>
              <span className="ml-2 text-gray-900">{user?.role}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">メール:</span>
              <span className="ml-2 text-gray-900">{user?.email}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">ユーザーID:</span>
              <span className="ml-2 text-gray-900">{user?.id}</span>
            </div>
          </div>
        </div>

        {/* 権限テスト: カスタムフックテスト */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            権限チェック結果（カスタムフック）
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canViewInventory() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              在庫閲覧: {canViewInventory() ? 'OK' : 'NG'}
            </div>
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canEditInventory() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              在庫編集: {canEditInventory() ? 'OK' : 'NG'}
            </div>
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canReceiveInventory() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              入荷処理: {canReceiveInventory() ? 'OK' : 'NG'}
            </div>
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canManageProd() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              生産管理: {canManageProd() ? 'OK' : 'NG'}
            </div>
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canManageMaster() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              マスタ管理: {canManageMaster() ? 'OK' : 'NG'}
            </div>
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isProductionManager() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              生産管理者: {isProductionManager() ? 'OK' : 'NG'}
            </div>
          </div>
        </div>

        {/* 権限テスト: PermissionGuardコンポーネント */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            権限制御テスト（ボタン表示）
          </h2>
          <div className="space-y-4">
            {/* 全ユーザー表示 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">全ユーザー表示</h3>
              <div className="flex flex-wrap gap-2">
                <PermissionGuard requiredRoles={['admin', 'production_manager', 'material_staff', 'viewer']}>
                  <Button variant="secondary">
                    在庫一覧表示
                  </Button>
                </PermissionGuard>
                <PermissionGuard requiredRoles={['admin', 'production_manager', 'material_staff', 'viewer']}>
                  <Button variant="secondary">
                    レポート閲覧
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {/* 資材担当以上 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">資材担当以上</h3>
              <div className="flex flex-wrap gap-2">
                <MaterialStaffOnly>
                  <Button variant="success">
                    入荷処理
                  </Button>
                </MaterialStaffOnly>
                <PermissionGuard requiredRoles={['admin', 'material_staff']}>
                  <Button variant="primary">
                    出庫処理
                  </Button>
                </PermissionGuard>
                <PermissionGuard requiredPermissions={['inventory.update']}>
                  <Button variant="warning">
                    在庫更新
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {/* 生産管理者以上 */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">生産管理者以上</h3>
              <div className="flex flex-wrap gap-2">
                <ProductionManagerOnly>
                  <Button variant="success">
                    生産計画作成
                  </Button>
                </ProductionManagerOnly>
                <PermissionGuard requiredPermissions={['production.create']}>
                  <Button variant="warning">
                    生産計画編集
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {/* 管理者のみ */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">管理者のみ</h3>
              <div className="flex flex-wrap gap-2">
                <AdminOnly>
                  <Button variant="primary">
                    ユーザー管理
                  </Button>
                </AdminOnly>
                <AdminOnly>
                  <Button variant="primary">
                    マスタ管理
                  </Button>
                </AdminOnly>
                <PermissionGuard requiredPermissions={['system.settings']}>
                  <Button variant="danger">
                    システム設定
                  </Button>
                </PermissionGuard>
              </div>
            </div>

            {/* フォールバック表示テスト */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">フォールバック表示テスト</h3>
              <PermissionGuard
                requiredRoles={['admin']}
                fallback={<span className="text-sm text-gray-500">管理者権限が必要です</span>}
                hideIfNoAccess={false}
              >
                <Button variant="danger">
                  管理者専用機能
                </Button>
              </PermissionGuard>
            </div>
          </div>
        </div>

        {/* API接続テスト */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            API接続テスト
          </h2>
          <div className="flex gap-4">
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const response = await fetch('http://localhost:3000/api/inventory', {
                    headers: {
                      'Authorization': `Bearer ${localStorage.getItem('token')}`,
                      'Content-Type': 'application/json'
                    }
                  })
                  const data = await response.json()
                  console.log('在庫データ:', data)
                  alert('在庫データを取得しました（コンソールを確認）')
                } catch (error) {
                  console.error('API Error:', error)
                  alert('API接続エラー')
                }
              }}
            >
              在庫データ取得テスト
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                const token = localStorage.getItem('token')
                const user = localStorage.getItem('user')
                console.log('Token:', token)
                console.log('User:', user)
                alert('認証情報をコンソールに出力しました')
              }}
            >
              認証情報確認
            </Button>
          </div>
        </div>
      </div>
  )
}

export default function HomePage() {
  return (
    <RouteGuard>
      <DashboardContent />
    </RouteGuard>
  )
}