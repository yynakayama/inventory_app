'use client'

import { ReactNode } from 'react'
import {Header} from './Header'

interface MainLayoutProps {
  children: ReactNode
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー（1回のみ表示） */}
      <Header />
      
      {/* メインコンテンツエリア */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {/* ページコンテンツ - そのまま表示 */}
        {children}
      </main>
      
      {/* フッター */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-sm text-gray-500">
            © 2025 在庫管理システム. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}