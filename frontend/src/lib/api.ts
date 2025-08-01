// API基盤クラス - 認証付きHTTPリクエストの共通化

// APIレスポンスの基本型定義
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

// HTTPメソッドの型定義
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

// リクエストオプションの型定義
interface RequestOptions {
  method?: HttpMethod
  body?: any
  headers?: Record<string, string>
  requireAuth?: boolean // 認証が必要かどうか
}

// APIエラーの型定義
class ApiError extends Error {
  status: number
  data?: any

  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

class ApiClient {
  private baseURL: string

  constructor(baseURL: string = 'http://localhost:3000') {
    this.baseURL = baseURL
  }

  // ローカルストレージからJWTトークンを取得
  private getToken(): string | null {
    if (typeof window === 'undefined') return null // SSR対応
    return localStorage.getItem('token')
  }

  // ローカルストレージからユーザー情報を取得
  private getUser(): any {
    if (typeof window === 'undefined') return null // SSR対応
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  }

  // 認証情報をクリア（ログアウト時に使用）
  private clearAuth(): void {
    if (typeof window === 'undefined') return // SSR対応
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  // HTTPリクエストの共通処理
  private async request<T = any>(
    endpoint: string, 
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      requireAuth = true
    } = options

    // リクエストURLの構築
    const url = `${this.baseURL}${endpoint}`

    // ヘッダーの準備
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    }

    // 認証が必要な場合、JWTトークンをヘッダーに追加
    if (requireAuth) {
      const token = this.getToken()
      if (token) {
        requestHeaders['Authorization'] = `Bearer ${token}`
      }
    }

    // リクエストボディの準備
    const requestBody = body ? JSON.stringify(body) : undefined

    try {
      // fetch APIでHTTPリクエストを送信
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: requestBody
      })

      // レスポンスのJSONパース
      let data: any
      try {
        data = await response.json()
      } catch {
        // JSONパースに失敗した場合（空のレスポンスなど）
        data = {}
      }

      // HTTPステータスコードでエラーチェック
      if (!response.ok) {
        // 401 Unauthorizedの場合、認証情報をクリア
        if (response.status === 401) {
          this.clearAuth()
          // ログインページにリダイレクト（フロントエンド側で処理）
          if (typeof window !== 'undefined') {
            window.location.href = '/login'
          }
        }

        throw new ApiError(
          data.message || data.error || `HTTP Error: ${response.status}`,
          response.status,
          data
        )
      }

      return data
    } catch (error) {
      // ネットワークエラーやその他のエラー
      if (error instanceof ApiError) {
        throw error
      }

      // fetch API自体のエラー（ネットワーク接続エラーなど）
      throw new ApiError(
        'ネットワークエラーが発生しました',
        0,
        { originalError: error }
      )
    }
  }

  // 各HTTPメソッドの便利メソッド

  // GETリクエスト
  async get<T = any>(endpoint: string, requireAuth = true): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', requireAuth })
  }

  // POSTリクエスト
  async post<T = any>(
    endpoint: string, 
    body?: any, 
    requireAuth = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body, requireAuth })
  }

  // PUTリクエスト
  async put<T = any>(
    endpoint: string, 
    body?: any, 
    requireAuth = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body, requireAuth })
  }

  // DELETEリクエスト
  async delete<T = any>(endpoint: string, requireAuth = true): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', requireAuth })
  }

  // PATCHリクエスト
  async patch<T = any>(
    endpoint: string, 
    body?: any, 
    requireAuth = true
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body, requireAuth })
  }

  // 認証関連の便利メソッド

  // ログイン状態の確認
  isAuthenticated(): boolean {
    return !!this.getToken()
  }

  // 現在のユーザー情報を取得
  getCurrentUser(): any {
    return this.getUser()
  }

  // ログアウト処理
  logout(): void {
    this.clearAuth()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  // トークンの有効性チェック（オプション）
  async validateToken(): Promise<boolean> {
    try {
      await this.get('/api/auth/validate')
      return true
    } catch {
      return false
    }
  }
}

// シングルトンインスタンスを作成・エクスポート
const api = new ApiClient()

export default api
export { ApiError }

// 型定義もエクスポート
export type { ApiResponse, HttpMethod, RequestOptions }