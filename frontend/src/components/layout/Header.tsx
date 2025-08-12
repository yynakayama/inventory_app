'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/providers/AuthProvider'
import  PermissionGuard  from '@/components/guards/PermissionGuard'
import  Button  from '@/components/ui/Button'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const { user, logout } = useAuth()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await logout()
      router.push('/login')
    } catch (error) {
      console.error('ログアウトエラー:', error)
    }
  }

  const navigationItems = [
  {
    label: 'ダッシュボード',
    href: '/dashboard',
    permissions: ['dashboard.view']
  },
  {
    label: '在庫管理',
    href: '/inventory',
    permissions: ['inventory.view'],
    children: [
      { label: '在庫一覧', href: '/inventory/list', permissions: ['inventory.view'] },
      { label: '取引履歴', href: '/inventory/transactions', permissions: ['inventory.view'] }
    ]
  },
  {
    label: '生産計画',
    href: '/production/plans',  // 直接リンク
    permissions: ['production.view']
  },
  {
    label: '調達管理',
    href: '/procurement/scheduled',  // 直接リンク
    permissions: ['procurement.view']
  },
  {
    label: 'マスタ管理',
    href: '/masters',
    permissions: ['masters.view'],
    children: [
      { label: '部品マスタ', href: '/masters/parts', permissions: ['masters.view'] },
      { label: '製品マスタ', href: '/masters/products', permissions: ['masters.view'] },
      { label: 'BOM管理', href: '/masters/bom', permissions: ['masters.view'] },
      { label: 'ユーザー管理', href: '/masters/users', permissions: ['masters.view'] },
    ]
  },
  {
    label: 'レポート',
    href: '/reports',
    permissions: ['reports.view']
  }
]

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ・タイトル */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                <span className="text-white font-bold text-sm">在</span>
              </div>
              <span className="text-xl font-semibold text-gray-900">
                在庫管理システム
              </span>
            </Link>
          </div>

          {/* デスクトップナビゲーション */}
          <nav className="hidden md:flex space-x-8">
            {navigationItems.map((item) => (
              <PermissionGuard key={item.href} requiredPermissions={item.permissions}>
                <div className="relative group">
                  <Link
                    href={item.href}
                    className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium transition-colors duration-200"
                  >
                    {item.label}
                  </Link>
                  
                  {/* ドロップダウンメニュー */}
                  {item.children && (
                    <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                      <div className="py-1">
                        {item.children.map((child) => (
                          <PermissionGuard key={child.href} requiredPermissions={child.permissions}>
                            <Link
                              href={child.href}
                              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-blue-600 transition-colors duration-200"
                            >
                              {child.label}
                            </Link>
                          </PermissionGuard>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </PermissionGuard>
            ))}
          </nav>

          {/* ユーザーメニュー */}
          <div className="flex items-center space-x-4">
            {/* ユーザー情報 */}
            <div className="hidden sm:flex items-center space-x-2">
              <div className="text-sm">
                <p className="text-gray-900 font-medium">{user?.username}</p>
                <p className="text-gray-500">{user?.role}</p>
              </div>
            </div>

            {/* ログアウトボタン */}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              className="hidden sm:block"
            >
              ログアウト
            </Button>

            {/* モバイルメニューボタン */}
            <button
              className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <span className="sr-only">メニューを開く</span>
              {/* ハンバーガーアイコン */}
              <svg
                className="h-6 w-6"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 24 24"
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* モバイルメニュー */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 border-t border-gray-200">
              {navigationItems.map((item) => (
                <PermissionGuard key={item.href} requiredPermissions={item.permissions}>
                  <div>
                    <Link
                      href={item.href}
                      className="text-gray-700 hover:text-blue-600 block px-3 py-2 text-base font-medium"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {item.label}
                    </Link>
                    {item.children && (
                      <div className="pl-4">
                        {item.children.map((child) => (
                          <PermissionGuard key={child.href} requiredPermissions={child.permissions}>
                            <Link
                              href={child.href}
                              className="text-gray-600 hover:text-blue-600 block px-3 py-2 text-sm"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              {child.label}
                            </Link>
                          </PermissionGuard>
                        ))}
                      </div>
                    )}
                  </div>
                </PermissionGuard>
              ))}
              
              {/* モバイル用ユーザー情報・ログアウト */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium text-gray-900">{user?.username}</p>
                  <p className="text-sm text-gray-500">{user?.role}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLogout}
                  className="mx-3 mt-2"
                >
                  ログアウト
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}