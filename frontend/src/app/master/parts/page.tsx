'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/providers/AuthProvider'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'

// 型定義
interface Part {
  part_code: string
  specification: string
  unit: string
  lead_time_days: number
  safety_stock: number
  supplier: string
  category: string
  unit_price: number
  remarks?: string
  created_at: string
  updated_at: string
}

interface PartFormData {
  part_code: string
  specification: string
  unit: string
  lead_time_days: number
  safety_stock: number
  supplier: string
  category: string
  unit_price: number
  remarks: string
}

interface SearchFilters {
  search: string
  category: string
}

interface Category {
  category_code: string
  category_name: string
  sort_order: number
}

export default function PartsPage() {
  const { user, token } = useAuth()
  const [parts, setParts] = useState<Part[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create')
  const [selectedPart, setSelectedPart] = useState<Part | null>(null)

  // フォーム状態
  const [formData, setFormData] = useState<PartFormData>({
    part_code: '',
    specification: '',
    unit: '個',
    lead_time_days: 7,
    safety_stock: 0,
    supplier: '',
    category: 'MECH',
    unit_price: 0,
    remarks: ''
  })

  // 検索フィルター（状態分離）
  const [inputFilters, setInputFilters] = useState<SearchFilters>({
    search: '',
    category: ''
  })
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    search: '',
    category: ''
  })

  // 検索入力フィールドのref
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // APIベースURL
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

  // 部品一覧取得
  const fetchParts = async () => {
    try {
      setIsSearching(true)
      const params = new URLSearchParams()
      if (searchFilters.search) params.append('search', searchFilters.search)
      if (searchFilters.category) params.append('category', searchFilters.category)
      params.append('limit', '500')

      const response = await fetch(`${API_BASE}/api/parts?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('部品一覧の取得に失敗しました')
      }

      const data = await response.json()
      setParts(data.data || [])
    } catch (error) {
      console.error('部品一覧取得エラー:', error)
      setError(error instanceof Error ? error.message : '部品一覧の取得に失敗しました')
    } finally {
      setIsSearching(false)
      // フォーカス復元（少し遅延させる）
      setTimeout(() => {
        const activeElement = document.activeElement?.tagName
        // フォーカスが失われている場合のみ復元
        if (!activeElement || activeElement === 'BODY') {
          if (searchInputRef.current) {
            searchInputRef.current.focus()
          }
        }
      }, 100)
    }
  }

  // カテゴリ一覧取得
  const fetchCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/parts/categories`)

      if (!response.ok) {
        throw new Error('カテゴリ一覧の取得に失敗しました')
      }

      const data = await response.json()
      setCategories(data.data || [])
    } catch (error) {
      console.error('カテゴリ一覧取得エラー:', error)
    }
  }

  // debounce処理（300ms遅延）
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchFilters(inputFilters)
    }, 300)

    return () => clearTimeout(timer)
  }, [inputFilters])

  // 初期データ取得
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await fetchCategories()
      setLoading(false)
    }

    if (token) {
      loadData()
    }
  }, [token])

  // 検索実行（searchFiltersが変更された時）
  useEffect(() => {
    if (token) {
      fetchParts()
    }
  }, [token, searchFilters])

  // リセット機能
  const handleReset = () => {
    setInputFilters({
      search: '',
      category: ''
    })
    // searchFiltersは自動的にdebounceで更新される
  }

  // フォームリセット
  const resetForm = () => {
    setFormData({
      part_code: '',
      specification: '',
      unit: '個',
      lead_time_days: 7,
      safety_stock: 0,
      supplier: '',
      category: 'MECH',
      unit_price: 0,
      remarks: ''
    })
  }

  // 新規登録モーダルを開く
  const handleCreate = () => {
    resetForm()
    setModalMode('create')
    setSelectedPart(null)
    setIsModalOpen(true)
  }

  // 編集モーダルを開く
  const handleEdit = (part: Part) => {
    setFormData({
      part_code: part.part_code,
      specification: part.specification || '',
      unit: part.unit || '個',
      lead_time_days: part.lead_time_days || 7,
      safety_stock: part.safety_stock || 0,
      supplier: part.supplier || '',
      category: part.category || 'MECH',
      unit_price: part.unit_price || 0,
      remarks: part.remarks || ''
    })
    setModalMode('edit')
    setSelectedPart(part)
    setIsModalOpen(true)
  }

  // 部品登録・更新
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      const url = modalMode === 'create'
        ? `${API_BASE}/api/parts`
        : `${API_BASE}/api/parts/${encodeURIComponent(selectedPart?.part_code || '')}`

      const method = modalMode === 'create' ? 'POST' : 'PUT'

      const body = modalMode === 'create' ? formData : {
        specification: formData.specification,
        unit: formData.unit,
        lead_time_days: formData.lead_time_days,
        safety_stock: formData.safety_stock,
        supplier: formData.supplier,
        category: formData.category,
        unit_price: formData.unit_price,
        remarks: formData.remarks
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '操作に失敗しました')
      }

      setIsModalOpen(false)
      await fetchParts()
    } catch (error) {
      console.error('保存エラー:', error)
      setError(error instanceof Error ? error.message : '保存に失敗しました')
    }
  }

  // 部品削除（論理削除）
  const handleDelete = async (partCode: string) => {
    if (!confirm('この部品を削除しますか？')) return

    try {
      const encodedPartCode = encodeURIComponent(partCode)
      const response = await fetch(`${API_BASE}/api/parts/${encodedPartCode}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '削除に失敗しました')
      }

      await fetchParts()
    } catch (error) {
      console.error('削除エラー:', error)
      setError(error instanceof Error ? error.message : '削除に失敗しました')
    }
  }

  // 権限チェック
  const canEdit = user?.role === 'admin' || user?.role === 'production_manager'
  const canDelete = user?.role === 'admin'

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ページヘッダー */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">部品マスター管理</h1>
        <p className="text-gray-600">部品の基本情報を管理します</p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="text-red-800">{error}</div>
          <button
            onClick={() => setError(null)}
            className="text-red-600 underline text-sm mt-2"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 検索フィルター */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="px-6 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* アクションボタン */}
            <div className="flex gap-3">
              {canEdit && (
                <Button onClick={handleCreate}>
                  ➕ 新規登録
                </Button>
              )}
              {isSearching && (
                <div className="flex items-center text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <span className="text-sm">検索中...</span>
                </div>
              )}
            </div>

            {/* フィルター */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 lg:max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  検索（部品コード・仕様）
                </label>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={inputFilters.search}
                  onChange={(e) => setInputFilters({...inputFilters, search: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="部品コードまたは仕様で検索"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  カテゴリ
                </label>
                <select
                  value={inputFilters.category}
                  onChange={(e) => setInputFilters({...inputFilters, category: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">全て</option>
                  {categories.map(cat => (
                    <option key={cat.category_code} value={cat.category_code}>
                      {cat.category_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  操作
                </label>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={handleReset}
                    disabled={isSearching}
                    className="flex-1"
                  >
                    🔄 リセット
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 部品一覧テーブル */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  部品コード
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  規格・仕様
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  カテゴリ
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  仕入先
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  単価
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  リードタイム
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  安全在庫
                </th>
                {(canEdit || canDelete) && (
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {parts.map((part) => (
                <tr key={part.part_code} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {part.part_code}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {part.specification || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {part.category}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {part.supplier || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    ¥{part.unit_price?.toLocaleString() || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {part.lead_time_days}日
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {part.safety_stock}{part.unit}
                  </td>
                  {(canEdit || canDelete) && (
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2 items-center">
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(part)}
                            className="whitespace-nowrap"
                          >
                            編集
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(part.part_code)}
                            className="whitespace-nowrap"
                          >
                            削除
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {parts.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            部品データがありません
          </div>
        )}
      </div>

      {/* 登録・編集モーダル */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'create' ? '部品新規登録' : '部品編集'}
        size="lg"
        footerActions={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleSubmit}
              type="submit"
            >
              {modalMode === 'create' ? '登録' : '更新'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                部品コード <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.part_code}
                onChange={(e) => setFormData({...formData, part_code: e.target.value})}
                disabled={modalMode === 'edit'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                規格・仕様
              </label>
              <input
                type="text"
                value={formData.specification}
                onChange={(e) => setFormData({...formData, specification: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                単位
              </label>
              <input
                type="text"
                value={formData.unit}
                onChange={(e) => setFormData({...formData, unit: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                カテゴリ
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                {categories.map(cat => (
                  <option key={cat.category_code} value={cat.category_code}>
                    {cat.category_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                仕入先
              </label>
              <input
                type="text"
                value={formData.supplier}
                onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                単価（円）
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.unit_price}
                onChange={(e) => setFormData({...formData, unit_price: parseFloat(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                調達リードタイム（日）
              </label>
              <input
                type="number"
                min="0"
                value={formData.lead_time_days}
                onChange={(e) => setFormData({...formData, lead_time_days: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                安全在庫数
              </label>
              <input
                type="number"
                min="0"
                value={formData.safety_stock}
                onChange={(e) => setFormData({...formData, safety_stock: parseInt(e.target.value) || 0})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              備考
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({...formData, remarks: e.target.value})}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}