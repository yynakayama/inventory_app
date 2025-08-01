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
  
  // 資材担当以上の権限が必要
  '/inventory/receipt': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager', 'material_staff'] as UserRole[]
  },
  '/inventory/transactions': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager', 'material_staff'] as UserRole[]
  },
  
  // 生産管理者以上の権限が必要
  '/production': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager'] as UserRole[]
  },
  '/production/plans': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager'] as UserRole[]
  },
  '/production/requirements': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager'] as UserRole[]
  },
  
  // 調達管理（資材担当以上）
  '/procurement': {
    requireAuth: true,
    allowedRoles: ['admin', 'production_manager', 'material_staff'] as UserRole[]
  },
  '/procurement/scheduled-receipts': {
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
          className="btn-primary w-full"
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

    // 認証が必要なページで未認証の場合
    if (pageConfig.requireAuth && !isAuthenticated) {
      router.push(fallbackPath)
      return
    }

    // 認証済みユーザーがログインページにアクセスした場合、ダッシュボードにリダイレクト
    if (pathname === '/login' && isAuthenticated) {
      router.push('/')
      return
    }

  }, [isLoading, isAuthenticated, pathname, router, fallbackPath, pageConfig.requireAuth])

  // ローディング中の表示
  if (isLoading) {
    return <LoadingSpinner />
  }

  // 認証が必要なページで未認証の場合（リダイレクト処理中）
  if (pageConfig.requireAuth && !isAuthenticated) {
    return <LoadingSpinner />
  }

  // 認証済みだが権限不足の場合
  if (isAuthenticated && pageConfig.allowedRoles && user) {
    const hasRequiredRole = pageConfig.allowedRoles.includes(user.role)
    
    if (!hasRequiredRole) {
      return <AccessDenied userRole={user.role} requiredRoles={pageConfig.allowedRoles} />
    }
  }

  // 条件を満たしている場合、子コンポーネントを表示
  return <>{children}</>
}

// 便利なHOC（Higher-Order Component）
export function withRouteGuard<P extends object>(
  Component: React.ComponentType<P>,
  guardOptions?: Omit<RouteGuardProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <RouteGuard {...guardOptions}>
        <Component {...props} />
      </RouteGuard>
    )
  }
}

// 権限チェック用のユーティリティ関数
export function checkPageAccess(pathname: string, userRole?: UserRole): {
  hasAccess: boolean
  requiresAuth: boolean
  allowedRoles?: UserRole[]
} {
  const config = PAGE_ACCESS_CONFIG[pathname]
  
  if (!config) {
    // 設定がないページは認証が必要と仮定
    return {
      hasAccess: !!userRole,
      requiresAuth: true
    }
  }

  if (!config.requireAuth) {
    return {
      hasAccess: true,
      requiresAuth: false
    }
  }

  if (!userRole) {
    return {
      hasAccess: false,
      requiresAuth: true,
      allowedRoles: config.allowedRoles
    }
  }

  if (config.allowedRoles) {
    return {
      hasAccess: config.allowedRoles.includes(userRole),
      requiresAuth: true,
      allowedRoles: config.allowedRoles
    }
  }

  return {
    hasAccess: true,
    requiresAuth: true
  }
}