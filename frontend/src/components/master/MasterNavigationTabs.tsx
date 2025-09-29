'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/providers/AuthProvider'

interface MasterTab {
  label: string
  href: string
  roles?: string[]
}

const masterTabs: MasterTab[] = [
  { label: '部品マスタ', href: '/master/parts' },
  { label: 'カテゴリマスタ', href: '/master/categories' },
  { label: '製品マスタ', href: '/master/products' },
  { label: '作業場所マスタ', href: '/master/stations' },
  { label: 'BOM管理', href: '/master/bom' },
  { label: 'ユーザー管理', href: '/master/users', roles: ['admin'] },
]

export default function MasterNavigationTabs() {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  // ユーザーの権限に応じてタブをフィルタリング
  const visibleTabs = masterTabs.filter(tab => {
    if (!tab.roles) return true
    return tab.roles.includes(user?.role || '')
  })

  const handleTabClick = (href: string) => {
    router.push(href)
  }

  return (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8" aria-label="マスター管理ナビゲーション">
        {visibleTabs.map((tab) => {
          const isActive = pathname === tab.href
          return (
            <button
              key={tab.href}
              onClick={() => handleTabClick(tab.href)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                transition-colors duration-200
                ${isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              {tab.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}