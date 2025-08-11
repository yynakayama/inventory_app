'use client'

import { useState, useEffect } from 'react'
import RouteGuard from '@/components/guards/RouteGuard'

// 在庫データの型定義
interface InventoryItem {
  part_code: string
  specification: string | null
  current_stock: number
  reserved_stock: number
  available_stock: number
  safety_stock: number
  supplier: string | null
  category: string | null
  is_low_stock: boolean
}

// カテゴリデータの型定義
interface Category {
  category_code: string
  category_name: string
  sort_order: number
}

// 検索フィルタの型定義
interface SearchFilters {
  search: string
  category: string
  low_stock: boolean
  shortage_only: boolean  // 生産不足フィルタ追加
}

// ステータス表示コンポーネント
interface StatusBadgeProps {
  availableStock: number
  currentStock: number
  safetyStock: number
}

function StatusBadge({ availableStock, currentStock, safetyStock }: StatusBadgeProps) {
  // 生産不足（最優先）
  if (availableStock < 0) {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
        🔴 生産不足
      </span>
    )
  }
  
  // 安全在庫割れ
  if (currentStock <= safetyStock) {
    return (
      <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
        ⚠️ 安全在庫割れ
      </span>
    )
  }
  
  // 正常
  return (
    <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
      ✅ 正常
    </span>
  )
}

// 検索・フィルタコンポーネント
interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  categories: Category[]
  onSearch: () => void
  onReset: () => void
}

function SearchFiltersComponent({ filters, onFiltersChange, categories, onSearch, onReset }: SearchFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 部品コード検索 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            部品コード
          </label>
          <input
            type="text"
            placeholder="部品コード・仕様で検索"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* カテゴリフィルタ */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            カテゴリ
          </label>
          <select
            value={filters.category}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">すべてのカテゴリ</option>
            {categories.map((cat) => (
              <option key={cat.category_code} value={cat.category_code}>
                {cat.category_name}
              </option>
            ))}
          </select>
        </div>

        {/* フィルタチェックボックス */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            状態フィルタ
          </label>
          <div className="space-y-1">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.shortage_only}
                onChange={(e) => onFiltersChange({ ...filters, shortage_only: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">🔴 生産不足のみ</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.low_stock}
                onChange={(e) => onFiltersChange({ ...filters, low_stock: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">⚠️ 安全在庫割れ</span>
            </label>
          </div>
        </div>

        {/* 操作ボタン */}
        <div className="flex flex-col justify-end space-y-2">
          <button
            onClick={onSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            🔍 検索
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            リセット
          </button>
        </div>
      </div>
    </div>
  )
}

// メイン在庫一覧コンテンツ
function InventoryListContent() {
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 検索フィルタ状態
  const [filters, setFilters] = useState<SearchFilters>({
    search: '',
    category: '',
    low_stock: false,
    shortage_only: false
  })

  // カテゴリデータ取得（認証不要）
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetch('http://localhost:3000/api/parts/categories')
        if (response.ok) {
          const result = await response.json()
          setCategories(result.data || [])
        }
      } catch (error) {
        console.error('カテゴリ取得エラー:', error)
      }
    }

    fetchCategories()
  }, [])

  // 在庫データ取得
  const fetchInventoryData = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      // クエリパラメータ構築
      const params = new URLSearchParams()
      if (filters.search.trim()) {
        params.append('search', filters.search.trim())
      }
      if (filters.category) {
        params.append('category', filters.category)
      }
      if (filters.low_stock) {
        params.append('low_stock', 'true')
      }

      const response = await fetch(`http://localhost:3000/api/inventory?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`在庫データの取得に失敗しました: ${response.status}`)
      }

      const result = await response.json()
      if (result.success) {
        let data = result.data || []
        
        // フロントエンド側で生産不足フィルタを適用
        if (filters.shortage_only) {
          data = data.filter((item: InventoryItem) => item.available_stock < 0)
        }
        
        setInventoryData(data)
      } else {
        throw new Error(result.message || 'データ取得に失敗しました')
      }

    } catch (err) {
      console.error('在庫データ取得エラー:', err)
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  // 初回データ取得
  useEffect(() => {
    fetchInventoryData()
  }, [])

  // 検索実行
  const handleSearch = () => {
    fetchInventoryData()
  }

  // フィルタリセット
  const handleReset = () => {
    setFilters({
      search: '',
      category: '',
      low_stock: false,
      shortage_only: false
    })
    
    // リセット後は自動で再検索
    setTimeout(() => {
      fetchInventoryData()
    }, 100)
  }

  // ローディング状態
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">在庫一覧</h1>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // エラー状態
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">在庫一覧</h1>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            データ取得エラー
          </h2>
          <p className="text-red-700">{error}</p>
          <button 
            onClick={fetchInventoryData} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  // 統計情報計算
  const totalItems = inventoryData.length
  const shortageItems = inventoryData.filter(item => item.available_stock < 0).length
  const lowStockItems = inventoryData.filter(item => item.is_low_stock).length

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">在庫一覧</h1>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleString('ja-JP')}
        </div>
      </div>

      {/* 概要統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-sm font-medium text-blue-800">総部品数</div>
          <div className="text-2xl font-bold text-blue-900">{totalItems}件</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-sm font-medium text-red-800">生産不足</div>
          <div className="text-2xl font-bold text-red-900">{shortageItems}件</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-sm font-medium text-yellow-800">安全在庫割れ</div>
          <div className="text-2xl font-bold text-yellow-900">{lowStockItems}件</div>
        </div>
      </div>

      {/* 検索・フィルタ */}
      <SearchFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* データテーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            在庫一覧 ({inventoryData.length}件)
          </h2>
        </div>

        {inventoryData.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            検索条件に該当する在庫データがありません
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    部品コード
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    規格・仕様
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    現在庫
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    予約済
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    利用可能
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状態
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    仕入先
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {inventoryData.map((item) => (
                  <tr key={item.part_code} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {item.part_code}
                      </div>
                      {item.category && (
                        <div className="text-xs text-gray-500">
                          {item.category}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {item.specification || '仕様未設定'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {item.current_stock.toLocaleString()}個
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                      {item.reserved_stock.toLocaleString()}個
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <span className={item.available_stock < 0 ? 'text-red-600' : 'text-gray-900'}>
                        {item.available_stock.toLocaleString()}個
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge
                        availableStock={item.available_stock}
                        currentStock={item.current_stock}
                        safetyStock={item.safety_stock}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.supplier || '未設定'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// メイン在庫一覧ページ
export default function InventoryListPage() {
  return (
    <RouteGuard>
      <InventoryListContent />
    </RouteGuard>
  )
}