import type { Metadata } from 'next'
import './globals.css'

// アプリケーション全体のメタデータ
export const metadata: Metadata = {
  title: {
    default: '在庫管理システム',
    template: '%s | 在庫管理システム'
  },
  description: '製造業向け在庫管理システム - 生産計画、部品管理、調達管理を統合',
  keywords: ['在庫管理', '製造業', '生産計画', 'BOM管理', '調達管理'],
}

// ルートレイアウトコンポーネント
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3b82f6" />
      </head>
      <body className="font-sans antialiased">
        <div id="app-root" className="min-h-screen bg-gray-50 flex flex-col">
          {/* 共通ヘッダー - 全ページで表示 */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                {/* ロゴ・タイトル */}
                <div className="flex items-center">
                  <h1 className="text-2xl font-bold text-gray-900">
                    在庫管理システム
                  </h1>
                </div>
                
                {/* ナビゲーションメニュー */}
                <nav className="hidden md:flex space-x-6">
                  <a href="/" className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium">
                    ダッシュボード
                  </a>
                  <a href="/inventory" className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium">
                    在庫管理
                  </a>
                  <a href="/production" className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium">
                    生産計画
                  </a>
                  <a href="/reports" className="text-gray-700 hover:text-blue-600 px-3 py-2 text-sm font-medium">
                    レポート
                  </a>
                </nav>
                
                {/* ユーザー情報 */}
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-700">
                    ログイン中: 管理者
                  </span>
                  <button className="btn-primary">
                    ログアウト
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* メインコンテンツエリア - 各ページの内容がここに入る */}
          <main className="flex-1">
            {children}
          </main>
          
          {/* 共通フッター - 全ページで表示 */}
          <footer className="bg-white border-t border-gray-200 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="text-center text-sm text-gray-500">
                © 2025 在庫管理システム. All rights reserved.
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}