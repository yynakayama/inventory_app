'use client'

import { useEffect, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth, type UserRole } from '@/providers/AuthProvider'

// ルートガードのProps型定義
interface RouteGuardProps {
  children: ReactNode
  requireAuth?: boolean // 認証が必要かどうか（デフォルト: true）
  allowedRoles?: UserRole[] // アクセス可能なロール（指定なしは全ロール許可）
  fallbackPath?: string // アクセス拒否時のリダイレクト先
}

// ページアクセス設定の型定義
interface PageAccessConfig {
  requireAuth: boolean
  allowedRoles?: UserRole[]
  redirectTo?: string
}

// ページ別アクセス制御設定
const PAGE_ACCESS_CONFIG: Record<string, PageAccessConfig> = {
  // 認証不要ページ
  '/login': {
    requireAuth: false
  },
  
  // 全ユーザーアクセス可能
  '/': {
    requireAuth: true
  },
  '/dashboard': {
    requireAuth: true
  },
  '/inventory': {
    requireAuth: true
  },
  '/inventory/list': {
    requireAuth: true
  },
  '/inventory/transactions': {
    requireAuth: true
  },
  
  // 生産計画（閲覧は全ユーザー、編集は管理者・生産管理者）- 修正！
  '/production': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  '/production/plans': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  '/production/requirements': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  
  // 調達管理（全ユーザー閲覧可能）- 修正！
  '/procurement': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  '/procurement/scheduled': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  '/procurement/scheduled-receipts': {
    requireAuth: true
    // allowedRoles を削除 - 全ユーザーアクセス可能
  },
  
  // 資材担当以上の権限が必要（編集系）
  '/inventory/receipt': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager', 'material_staff'] as UserRole[]
  },
  
  // マスタ管理（管理者のみ）
  '/masters': {
    requireAuth: true,
    allowedRoles: ['admin'] as UserRole[]
  },
  '/masters/parts': {
    requireAuth: true,
    allowedRoles: ['admin'] as UserRole[]
  },
  '/masters/products': {
    requireAuth: true,
    allowedRoles: ['admin'] as UserRole[]
  },
  '/masters/bom': {
    requireAuth: true,
    allowedRoles: ['admin'] as UserRole[]
  },
  '/masters/users': {
    requireAuth: true,
    allowedRoles: ['admin'] as UserRole[]
  },
  
  // レポート（全ユーザー閲覧可能）
  '/reports': {
    requireAuth: true
  }
}

// ローディングコンポーネント
function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">認証情報を確認中...</p>
      </div>
    </div>
  )
}

// アクセス拒否コンポーネント
function AccessDenied({ userRole, requiredRoles }: { userRole?: UserRole, requiredRoles?: UserRole[] }) {
  const router = useRouter()

  const handleBackToDashboard = () => {
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">アクセス権限がありません</h2>
          <p className="text-gray-600 mb-4">
            このページにアクセスするための権限がありません。
          </p>
          
          {/* 権限情報表示 */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 text-sm">
            <p className="text-gray-700">
              <span className="font-medium">現在の権限:</span> {userRole || '不明'}
            </p>
            {requiredRoles && requiredRoles.length > 0 && (
              <p className="text-gray-700 mt-2">
                <span className="font-medium">必要な権限:</span>{' '}
                {requiredRoles.map(role => {
                  const roleNames: Record<UserRole, string> = {
                    admin: '管理者',
                    production_manager: '生産管理者',
                    material_staff: '資材担当',
                    viewer: '閲覧者'
                  }
                  return roleNames[role] || role
                }).join('、')}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleBackToDashboard}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          ダッシュボードに戻る
        </button>
      </div>
    </div>
  )
}

// メインのルートガードコンポーネント
export default function RouteGuard({ 
  children, 
  requireAuth = true, 
  allowedRoles,
  fallbackPath = '/login'
}: RouteGuardProps) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // ページ設定を取得（設定がない場合は props の値を使用）
  const pageConfig = PAGE_ACCESS_CONFIG[pathname] || {
    requireAuth,
    allowedRoles
  }

  useEffect(() => {
    // ローディング中は何もしない
    if (isLoading) return

    // 認証が不要なページの場合
    if (!pageConfig.requireAuth) {
      return
    }

    // 未認証の場合はログインページにリダイレクト
    if (!isAuthenticated) {
      router.push('/login')
      return
    }

    // 権限チェック（ページ設定または props で指定された権限）
    const requiredRoles = pageConfig.allowedRoles || allowedRoles
    if (requiredRoles && requiredRoles.length > 0 && user?.role) {
      if (!requiredRoles.includes(user.role)) {
        // アクセス拒否ページを表示（リダイレクトしない）
        return
      }
    }
  }, [isLoading, isAuthenticated, user, router, pathname, pageConfig, allowedRoles])

  // ローディング中
  if (isLoading) {
    return <LoadingSpinner />
  }

  // 認証が不要なページの場合はそのまま表示
  if (!pageConfig.requireAuth) {
    return <>{children}</>
  }

  // 未認証の場合は何も表示しない（useEffectでリダイレクトされる）
  if (!isAuthenticated) {
    return <LoadingSpinner />
  }

  // 権限チェック
  const requiredRoles = pageConfig.allowedRoles || allowedRoles
  if (requiredRoles && requiredRoles.length > 0 && user?.role) {
    if (!requiredRoles.includes(user.role)) {
      return <AccessDenied userRole={user.role} requiredRoles={requiredRoles} />
    }
  }

  // 認証済み・権限OK
  return <>{children}</>
}