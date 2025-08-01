'use client'

import { useAuth, usePermissions } from '@/providers/AuthProvider'
import RouteGuard from '@/components/RouteGuard'
import PermissionGuard, { 
  AdminOnly, 
  ProductionManagerOnly, 
  MaterialStaffOnly,
  usePermissionCheck 
} from '@/components/PermissionGuard'

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
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                生産管理システム
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{user?.name || user?.username}</span>
                <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {user?.role === 'admin' && '管理者'}
                  {user?.role === 'production_manager' && '生産管理者'}
                  {user?.role === 'material_staff' && '資材担当'}
                  {user?.role === 'viewer' && '閲覧者'}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="btn-secondary text-sm"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="space-y-8">
          {/* ユーザー情報表示 */}
          <div className="card-base">
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
          <div className="card-base">
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
                生産計画: {canManageProd() ? 'OK' : 'NG'}
              </div>
              <div className="flex items-center">
                <span className={`inline-block w-3 h-3 rounded-full mr-2 ${canManageMaster() ? 'bg-green-500' : 'bg-red-500'}`}></span>
                マスタ管理: {canManageMaster() ? 'OK' : 'NG'}
              </div>
              <div className="flex items-center">
                <span className={`inline-block w-3 h-3 rounded-full mr-2 ${isAdmin() ? 'bg-green-500' : 'bg-red-500'}`}></span>
                管理者権限: {isAdmin() ? 'OK' : 'NG'}
              </div>
            </div>
          </div>

          {/* 権限テスト: PermissionGuardコンポーネント */}
          <div className="card-base">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              権限制御テスト（ボタン表示）
            </h2>
            <div className="space-y-4">
              {/* 全ユーザー表示 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">全ユーザー表示</h3>
                <div className="flex flex-wrap gap-2">
                  <PermissionGuard requiredRoles={['admin', 'production_manager', 'material_staff', 'viewer']}>
                    <button className="btn-secondary">在庫一覧表示</button>
                  </PermissionGuard>
                  <PermissionGuard requiredRoles={['admin', 'production_manager', 'material_staff', 'viewer']}>
                    <button className="btn-secondary">レポート閲覧</button>
                  </PermissionGuard>
                </div>
              </div>

              {/* 資材担当以上 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">資材担当以上</h3>
                <div className="flex flex-wrap gap-2">
                  <MaterialStaffOnly>
                    <button className="btn-primary">入荷処理</button>
                  </MaterialStaffOnly>
                  <PermissionGuard requiredRoles={['admin', 'material_staff']}>
                    <button className="btn-primary">出庫処理</button>
                  </PermissionGuard>
                  <PermissionGuard requiredPermissions={['inventory.update']}>
                    <button className="btn-primary">在庫更新</button>
                  </PermissionGuard>
                </div>
              </div>

              {/* 生産管理者以上 */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">生産管理者以上</h3>
                <div className="flex flex-wrap gap-2">
                  <ProductionManagerOnly>
                    <button className="btn-primary">生産計画作成</button>
                  </ProductionManagerOnly>
                  <PermissionGuard requiredPermissions={['production.create']}>
                    <button className="btn-primary">生産計画編集</button>
                  </PermissionGuard>
                </div>
              </div>

              {/* 管理者のみ */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">管理者のみ</h3>
                <div className="flex flex-wrap gap-2">
                  <AdminOnly>
                    <button className="btn-primary">ユーザー管理</button>
                  </AdminOnly>
                  <AdminOnly>
                    <button className="btn-primary">マスタ管理</button>
                  </AdminOnly>
                  <PermissionGuard requiredPermissions={['system.settings']}>
                    <button className="btn-primary">システム設定</button>
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
                  <button className="btn-primary">管理者専用機能</button>
                </PermissionGuard>
              </div>
            </div>
          </div>

          {/* API接続テスト */}
          <div className="card-base">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              API接続テスト
            </h2>
            <div className="flex gap-4">
              <button 
                className="btn-primary"
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
              </button>
              
              <button 
                className="btn-secondary"
                onClick={() => {
                  const token = localStorage.getItem('token')
                  const user = localStorage.getItem('user')
                  console.log('Token:', token)
                  console.log('User:', user)
                  alert('認証情報をコンソールに出力しました')
                }}
              >
                認証情報確認
              </button>
            </div>
          </div>
        </div>
      </main>
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