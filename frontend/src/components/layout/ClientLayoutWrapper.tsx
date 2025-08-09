'use client'

import { useAuth } from '@/providers/AuthProvider'
import MainLayout from './MainLayout'

interface ClientLayoutWrapperProps {
  children: React.ReactNode
}

export default function ClientLayoutWrapper({ children }: ClientLayoutWrapperProps) {
  const { user, isLoading } = useAuth()
  
  // ローディング中
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">読み込み中...</p>
        </div>
      </div>
    )
  }
  
  // 未認証の場合はレイアウトなしで表示（ログインページ用）
  if (!user) {
    return <>{children}</>
  }
  
  // 認証済みの場合はMainLayoutを適用
  return (
    <MainLayout>
      {children}
    </MainLayout>
  )
}