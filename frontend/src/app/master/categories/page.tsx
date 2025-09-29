'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import MasterNavigationTabs from '@/components/master/MasterNavigationTabs'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

// 型定義
interface Category {
  category_code: string
  category_name: string
  is_active: boolean
  created_at: string
}

interface CategoryFormData {
  category_code: string
  category_name: string
  is_active: boolean
}

export default function CategoriesPage() {
  const { user, token } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>({
    category_code: '',
    category_name: '',
    is_active: true
  })

  // カテゴリ一覧取得
  const fetchCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/categories', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('カテゴリの取得に失敗しました')
      }

      const result = await response.json()
      setCategories(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  // カテゴリ新規登録
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'カテゴリの登録に失敗しました')
      }

      setIsCreateModalOpen(false)
      setFormData({ category_code: '', category_name: '', is_active: true })
      fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  // カテゴリ更新
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCategory) return

    try {
      const response = await fetch(`/api/categories/${editingCategory.category_code}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          category_name: formData.category_name,
          is_active: formData.is_active
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'カテゴリの更新に失敗しました')
      }

      setIsEditModalOpen(false)
      setEditingCategory(null)
      setFormData({ category_code: '', category_name: '', is_active: true })
      fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  // カテゴリ削除
  const handleDelete = async (categoryCode: string) => {
    if (!confirm('このカテゴリを削除してもよろしいですか？\n※部品マスターで使用中の場合は削除できません。')) {
      return
    }

    try {
      const response = await fetch(`/api/categories/${categoryCode}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'カテゴリの削除に失敗しました')
      }

      fetchCategories()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  // 編集モーダルを開く
  const openEditModal = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      category_code: category.category_code,
      category_name: category.category_name,
      is_active: category.is_active
    })
    setIsEditModalOpen(true)
  }

  // モーダルを閉じる
  const closeModals = () => {
    setIsCreateModalOpen(false)
    setIsEditModalOpen(false)
    setEditingCategory(null)
    setFormData({ category_code: '', category_name: '', is_active: true })
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <MasterNavigationTabs />
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">読み込み中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <MasterNavigationTabs />

      <div className="bg-white rounded-lg shadow">
        {/* ヘッダー */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold text-gray-800">部品カテゴリーマスター</h1>
            {user?.role === 'admin' && (
              <Button
                onClick={() => setIsCreateModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                新規カテゴリー
              </Button>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-2">
            ※現在はプレースホルダとして実装。将来的に部品マスターとの関連付け機能を拡張予定
          </p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-500 underline text-sm mt-2"
            >
              閉じる
            </button>
          </div>
        )}

        {/* カテゴリー一覧テーブル */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  カテゴリーコード
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  カテゴリー名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状態
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.category_code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {category.category_code}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {category.category_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      category.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {category.is_active ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    {user?.role === 'admin' && (
                      <>
                        <Button
                          onClick={() => openEditModal(category)}
                          variant="secondary"
                          size="sm"
                        >
                          編集
                        </Button>
                        <Button
                          onClick={() => handleDelete(category.category_code)}
                          variant="danger"
                          size="sm"
                        >
                          削除
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {categories.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              カテゴリーが登録されていません
            </div>
          )}
        </div>
      </div>

      {/* 新規登録モーダル */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeModals}
        title="新規カテゴリー登録"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              カテゴリーコード <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.category_code}
              onChange={(e) => setFormData({ ...formData, category_code: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              maxLength={20}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              カテゴリー名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.category_name}
              onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              maxLength={50}
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active_create"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_active_create" className="ml-2 text-sm text-gray-700">
              有効
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              onClick={closeModals}
              variant="secondary"
            >
              キャンセル
            </Button>
            <Button type="submit">
              登録
            </Button>
          </div>
        </form>
      </Modal>

      {/* 編集モーダル */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={closeModals}
        title="カテゴリー編集"
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              カテゴリーコード
            </label>
            <input
              type="text"
              value={formData.category_code}
              className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">※カテゴリーコードは変更できません</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              カテゴリー名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.category_name}
              onChange={(e) => setFormData({ ...formData, category_name: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              maxLength={50}
            />
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active_edit"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="is_active_edit" className="ml-2 text-sm text-gray-700">
              有効
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button
              type="button"
              onClick={closeModals}
              variant="secondary"
            >
              キャンセル
            </Button>
            <Button type="submit">
              更新
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}