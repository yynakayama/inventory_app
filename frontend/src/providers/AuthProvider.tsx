'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import api from '@/lib/api'

// ユーザーロールの型定義
export type UserRole = 'admin' | 'production_manager' | 'material_staff' | 'viewer'

// ユーザー情報の型定義
interface User {
  id: number
  username: string
  email: string
  role: UserRole
  name: string
}

// 認証状態の型定義
interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

// 認証Context用の型定義
interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
  hasRole: (role: UserRole | UserRole[]) => boolean
  hasAnyRole: (roles: UserRole[]) => boolean
}

// React Context の作成
const AuthContext = createContext<AuthContextType | undefined>(undefined)

// AuthProvider コンポーネントのProps型定義
interface AuthProviderProps {
  children: ReactNode
}

// AuthProvider コンポーネント
export function AuthProvider({ children }: AuthProviderProps) {
  // 認証状態を管理するstate
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true, // 初期状態はローディング中
    isAuthenticated: false
  })

  // 初期化処理 - ページロード時にlocalStorageから認証情報を復元
  useEffect(() => {
    initializeAuth()
  }, [])

  // 認証情報の初期化
  const initializeAuth = async () => {
    try {
      // localStorageからユーザー情報を取得
      const storedUser = localStorage.getItem('user')
      const token = localStorage.getItem('token')

      if (storedUser && token) {
        const user: User = JSON.parse(storedUser)
        
        // トークンの有効性を確認（簡易版）
        // Note: バックエンドに /api/auth/validate エンドポイントがないため、簡易チェック
        try {
          const testResponse = await api.get('/api/inventory', true)
          // APIが正常に応答した場合、トークンは有効
          setAuthState({
            user,
            isLoading: false,
            isAuthenticated: true
          })
        } catch (error) {
          // トークンが無効な場合は認証情報をクリア
          console.log('トークン検証失敗、認証情報をクリアします')
          clearAuthState()
        }
      } else {
        // 認証情報がない場合
        setAuthState({
          user: null,
          isLoading: false,
          isAuthenticated: false
        })
      }
    } catch (error) {
      console.error('認証初期化エラー:', error)
      clearAuthState()
    }
  }

  // 認証状態をクリア
  const clearAuthState = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    setAuthState({
      user: null,
      isLoading: false,
      isAuthenticated: false
    })
  }

  // ログイン処理
  const login = async (username: string, password: string) => {
    setAuthState(prev => ({ ...prev, isLoading: true }))

    try {
      const response = await api.post('/api/auth/login', {
        username,
        password
      }, false) // ログインAPIは認証不要

      if (response.success && response.data) {
        // バックエンドのレスポンス構造に対応
        const { tokens, user } = response.data
        const token = tokens?.accessToken || response.data.token

        if (token && user) {
          // localStorageに保存
          localStorage.setItem('token', token)
          localStorage.setItem('user', JSON.stringify(user))

          // 認証状態を更新
          setAuthState({
            user,
            isLoading: false,
            isAuthenticated: true
          })

          return { success: true }
        } else {
          setAuthState(prev => ({ ...prev, isLoading: false }))
          return { 
            success: false, 
            message: 'ログインレスポンスが不正です' 
          }
        }
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }))
        return { 
          success: false, 
          message: response.message || 'ログインに失敗しました' 
        }
      }
    } catch (error: any) {
      console.error('ログインエラー:', error)
      setAuthState(prev => ({ ...prev, isLoading: false }))
      return { 
        success: false, 
        message: error.message || 'サーバーに接続できませんでした' 
      }
    }
  }

  // ログアウト処理
  const logout = () => {
    clearAuthState()
    // ログインページにリダイレクト
    window.location.href = '/login'
  }

  // ユーザー情報の再取得
  const refreshUser = async () => {
    try {
      const response = await api.get('/api/auth/me')
      
      if (response.success && response.data) {
        const updatedUser = response.data
        localStorage.setItem('user', JSON.stringify(updatedUser))
        
        setAuthState(prev => ({
          ...prev,
          user: updatedUser
        }))
      }
    } catch (error) {
      console.error('ユーザー情報取得エラー:', error)
      // エラーの場合はログアウト
      logout()
    }
  }

  // 特定のロールを持っているかチェック
  const hasRole = (role: UserRole | UserRole[]): boolean => {
    if (!authState.user) return false
    
    if (Array.isArray(role)) {
      return role.includes(authState.user.role)
    }
    
    return authState.user.role === role
  }

  // いずれかのロールを持っているかチェック
  const hasAnyRole = (roles: UserRole[]): boolean => {
    if (!authState.user) return false
    return roles.includes(authState.user.role)
  }

  // Contextに提供する値
  const contextValue: AuthContextType = {
    ...authState,
    login,
    logout,
    refreshUser,
    hasRole,
    hasAnyRole
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

// useAuth カスタムフック
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  
  if (context === undefined) {
    throw new Error('useAuth は AuthProvider 内で使用する必要があります')
  }
  
  return context
}

// 権限チェック用の便利なカスタムフック
export function usePermissions() {
  const { hasRole, hasAnyRole, user } = useAuth()

  return {
    // 管理者権限
    isAdmin: () => hasRole('admin'),
    
    // 生産管理権限（管理者 + 生産管理者）
    canManageProduction: () => hasAnyRole(['admin', 'production_manager']),
    
    // 資材管理権限（管理者 + 生産管理者 + 資材担当）
    canManageMaterial: () => hasAnyRole(['admin', 'production_manager', 'material_staff']),
    
    // 閲覧権限（全ユーザー）
    canView: () => !!user,
    
    // カスタム権限チェック
    hasRole,
    hasAnyRole
  }
}