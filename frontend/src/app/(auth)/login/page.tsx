'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/providers/AuthProvider'
import Button from '@/components/ui/Button'

// ログインフォームのデータ型定義
interface LoginFormData {
  username: string
  password: string
}

export default function LoginPage() {
  // AuthProviderからlogin関数を取得
  const { login } = useAuth()
  
  // フォームの入力値を管理するstate
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: ''
  })
  
  // ローディング状態とエラーメッセージを管理
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Next.js App Routerでページ遷移に使用
  const router = useRouter()

  // 入力値変更時のハンドラー関数
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // エラーメッセージをクリア
    if (error) setError('')
  }

  // ログイン処理のメイン関数
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault() // フォームのデフォルト送信を防ぐ
    
    // バリデーション
    if (!formData.username || !formData.password) {
      setError('ユーザー名とパスワードを入力してください')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // AuthProviderのlogin関数を使用
      const result = await login(formData.username, formData.password)

      if (result.success) {
        // ログイン成功時はダッシュボードにリダイレクト
        router.push('/dashboard')
      } else {
        // ログイン失敗時のエラー表示
        setError(result.message || 'ログインに失敗しました')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('予期しないエラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="card-base w-full max-w-md">
        {/* ヘッダー部分 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            生産管理システム
          </h1>
          <p className="text-gray-600">
            アカウントにログインしてください
          </p>
        </div>

        {/* エラーメッセージ表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* ログインフォーム */}
        <form onSubmit={handleLogin} className="space-y-6">
          {/* ユーザー名入力 */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              ユーザー名
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleInputChange}
              className="input-base"
              placeholder="ユーザー名を入力"
              disabled={isLoading}
              required
            />
          </div>

          {/* パスワード入力 */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              パスワード
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="input-base"
              placeholder="パスワードを入力"
              disabled={isLoading}
              required
            />
          </div>

          {/* ログインボタン */}
          <Button
            type="submit"
            variant="primary"
            disabled={isLoading}
            isLoading={isLoading}
            className="w-full"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </Button>
        </form>

        {/* テストユーザー情報 */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">テストユーザー</h3>
          <div className="text-xs text-gray-600 space-y-1">
            <p>管理者: admin / admin123</p>
            <p>生産管理: production_mgr / prod123</p>
            <p>資材担当: material_staff / material123</p>
            <p>閲覧者: viewer_user / viewer123</p>
          </div>
        </div>
      </div>
    </div>
  )
}