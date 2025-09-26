'use client'

import { useState, useEffect } from 'react'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'

interface User {
  id: number
  username: string
  email: string | null
  role: 'admin' | 'production_manager' | 'material_staff' | 'viewer'
  is_active: boolean
  last_login_at: string | null
  created_at: string
  updated_at: string
}

const ROLE_LABELS = {
  admin: '管理者',
  production_manager: '生産管理者',
  material_staff: '資材担当者',
  viewer: '閲覧者'
} as const

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [showUserModal, setShowUserModal] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const [userForm, setUserForm] = useState({
    username: '',
    email: '',
    password: '',
    role: 'viewer' as User['role'],
    is_active: true
  })

  const [passwordForm, setPasswordForm] = useState({
    new_password: '',
    confirm_password: ''
  })

  const fetchUsers = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (searchTerm) params.append('search', searchTerm)
      if (roleFilter) params.append('role', roleFilter)
      if (statusFilter) params.append('is_active', statusFilter)

      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/users?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('ユーザー一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) setUsers(result.data)
      else throw new Error(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ユーザー一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleNewUser = () => {
    setIsEditing(false)
    setUserForm({ username: '', email: '', password: '', role: 'viewer', is_active: true })
    setShowUserModal(true)
  }

  const handleEditUser = (user: User) => {
    setIsEditing(true)
    setSelectedUser(user)
    setUserForm({
      username: user.username,
      email: user.email || '',
      password: '',
      role: user.role,
      is_active: user.is_active
    })
    setShowUserModal(true)
  }

  const handlePasswordReset = (user: User) => {
    setSelectedUser(user)
    setPasswordForm({ new_password: '', confirm_password: '' })
    setShowPasswordModal(true)
  }

  const handleSubmit = async () => {
    if (!isEditing && !userForm.password) {
      alert('パスワードは必須です')
      return
    }

    if (!isEditing && userForm.password.length < 8) {
      alert('パスワードは8文字以上である必要があります')
      return
    }

    const url = isEditing ? `http://localhost:3000/api/users/${selectedUser?.id}` : 'http://localhost:3000/api/users'
    const method = isEditing ? 'PUT' : 'POST'

    const body = isEditing
      ? { email: userForm.email || null, role: userForm.role, is_active: userForm.is_active }
      : { ...userForm, email: userForm.email || null }

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || `ユーザーの${isEditing ? '更新' : '作成'}に失敗しました`)

      alert(`ユーザーを${isEditing ? '更新' : '作成'}しました`)
      setShowUserModal(false)
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : `ユーザー${isEditing ? '更新' : '作成'}エラー`)
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordReset2 = async () => {
    if (!passwordForm.new_password || passwordForm.new_password.length < 8) {
      alert('新しいパスワードは8文字以上である必要があります')
      return
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      alert('パスワードが一致しません')
      return
    }

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/users/${selectedUser?.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: passwordForm.new_password })
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'パスワードリセットに失敗しました')

      alert('パスワードをリセットしました')
      setShowPasswordModal(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'パスワードリセットエラー')
    } finally {
      setLoading(false)
    }
  }

  const toggleUserStatus = async (user: User) => {
    if (!confirm(`ユーザー「${user.username}」を${user.is_active ? '無効化' : '有効化'}しますか？`)) return

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/users/${user.id}/toggle-active`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'ユーザー状態の変更に失敗しました')

      alert(result.message)
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ユーザー状態変更エラー')
    } finally {
      setLoading(false)
    }
  }

  const deleteUser = async (user: User) => {
    if (!confirm(`ユーザー「${user.username}」を本当に削除しますか？この操作は元に戻せません。`)) return

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || 'ユーザーの削除に失敗しました')

      alert('ユーザーを削除しました')
      await fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'ユーザー削除エラー')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const filteredUsers = users.filter(user => {
    if (searchTerm && !user.username.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !(user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))) {
      return false
    }
    if (roleFilter && user.role !== roleFilter) return false
    if (statusFilter && user.is_active.toString() !== statusFilter) return false
    return true
  })

  return (
    <RouteGuard>
      <PermissionGuard requiredRoles={['admin']}>
        <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">👥 ユーザー管理</h1>
            <p className="text-gray-600">システムユーザーの管理を行います。</p>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 border-b border-gray-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="ユーザー名またはメールアドレスで検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">全ての権限</option>
                    <option value="admin">管理者</option>
                    <option value="production_manager">生産管理者</option>
                    <option value="material_staff">資材担当者</option>
                    <option value="viewer">閲覧者</option>
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">全てのステータス</option>
                    <option value="true">有効</option>
                    <option value="false">無効</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleNewUser}>➕ 新規ユーザー</Button>
                  <Button variant="secondary" onClick={fetchUsers} isLoading={loading}>🔄 更新</Button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ユーザー名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メール</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">権限</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状態</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">最終ログイン</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">読み込み中...</td></tr>
                  ) : filteredUsers.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-500">ユーザーが見つかりません</td></tr>
                  ) : (
                    filteredUsers.map(user => (
                      <tr key={user.id}>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900">{user.username}</div>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.email || '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'admin' ? 'bg-red-100 text-red-800' :
                            user.role === 'production_manager' ? 'bg-blue-100 text-blue-800' :
                            user.role === 'material_staff' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {ROLE_LABELS[user.role]}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {user.is_active ? '有効' : '無効'}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.last_login_at ? new Date(user.last_login_at).toLocaleString('ja-JP') : '未ログイン'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditUser(user)}>編集</Button>
                          <Button size="sm" variant="secondary" onClick={() => handlePasswordReset(user)}>パスワード</Button>
                          <Button size="sm" variant={user.is_active ? 'danger' : 'outline'} onClick={() => toggleUserStatus(user)}>
                            {user.is_active ? '無効化' : '有効化'}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deleteUser(user)}>削除</Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* User Create/Edit Modal */}
        {showUserModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">{isEditing ? 'ユーザー編集' : '新規ユーザー作成'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ユーザー名（必須）</label>
                  <input
                    type="text"
                    value={userForm.username}
                    onChange={(e) => setUserForm(prev => ({ ...prev, username: e.target.value }))}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${isEditing ? 'bg-gray-100' : ''}`}
                    placeholder="例: john_doe"
                    disabled={isEditing}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス（任意）</label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: user@example.com"
                  />
                </div>
                {!isEditing && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（必須）</label>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(e) => setUserForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="8文字以上"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">権限</label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm(prev => ({ ...prev, role: e.target.value as User['role'] }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="viewer">閲覧者</option>
                    <option value="material_staff">資材担当者</option>
                    <option value="production_manager">生産管理者</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={userForm.is_active}
                    onChange={(e) => setUserForm(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                    有効なユーザー
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-6 justify-end">
                <Button variant="secondary" onClick={() => setShowUserModal(false)} disabled={loading}>キャンセル</Button>
                <Button onClick={handleSubmit} disabled={!userForm.username.trim() || (!isEditing && !userForm.password) || loading} isLoading={loading}>
                  {isEditing ? '更新' : '作成'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Password Reset Modal */}
        {showPasswordModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">パスワードリセット</h3>
              <p className="text-sm text-gray-600 mb-4">ユーザー「{selectedUser?.username}」のパスワードを変更します。</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
                  <input
                    type="password"
                    value={passwordForm.new_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, new_password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="8文字以上"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">パスワード確認</label>
                  <input
                    type="password"
                    value={passwordForm.confirm_password}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirm_password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="再入力"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6 justify-end">
                <Button variant="secondary" onClick={() => setShowPasswordModal(false)} disabled={loading}>キャンセル</Button>
                <Button onClick={handlePasswordReset2} disabled={!passwordForm.new_password || !passwordForm.confirm_password || loading} isLoading={loading}>
                  パスワード変更
                </Button>
              </div>
            </div>
          </div>
        )}
      </PermissionGuard>
    </RouteGuard>
  )
}