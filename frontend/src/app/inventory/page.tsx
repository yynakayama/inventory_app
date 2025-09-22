'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import { InventoryEditGuard, usePermissionCheck } from '@/components/guards/PermissionGuard'
import PartCodeSelector from '@/components/ui/PartCodeSelector'
import Button from '@/components/ui/Button'
import { getConditionalRowColor } from '@/utils/tableRowColors'

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
  lead_time_days?: number
  unit_price?: number
}

// 部品詳細データの型定義
interface PartDetail {
  part_code: string
  specification: string | null
  category: string | null
  supplier: string | null
  lead_time_days: number
  unit_price: number
  safety_stock: number
  current_stock: number
  reserved_stock: number
  available_stock: number
  created_at: string
  updated_at: string
}

// 履歴データの型定義
interface InventoryHistory {
  id: number
  part_code: string
  transaction_type: 'receipt' | 'issue' | 'adjustment' | 'stocktaking'
  quantity: number
  before_quantity?: number
  after_quantity?: number
  before_stock?: number
  after_stock?: number
  supplier?: string
  remarks?: string
  created_at: string
  transaction_date?: string
  created_by: string
}

// 在庫調整フォームの型定義
interface AdjustmentForm {
  transaction_type: 'receipt' | 'issue'
  quantity: string
  supplier: string
  remarks: string
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

// 棚卸アイテムの型定義
interface StocktakingItem {
  part_code: string
  actual_quantity: number
  reason_code: string
  remarks: string
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
  onReset: () => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  isSearching?: boolean
}

function SearchFiltersComponent({ filters, onFiltersChange, categories, onReset, searchInputRef, isSearching = false }: SearchFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 {/* 部品コード検索 */}
         <div>
           <label className="block text-sm font-medium text-gray-700 mb-1">
             部品コード
           </label>
           <input
             ref={searchInputRef}
             type="text"
             value={filters.search}
             onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
             placeholder="部品コード・仕様で検索"
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
          {isSearching && (
            <div className="flex items-center text-blue-600 justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
              <span className="text-sm">検索中...</span>
            </div>
          )}
          <Button
            variant="secondary"
            onClick={onReset}
          >
            🔄 リセット
          </Button>
        </div>
      </div>
    </div>
  )
}

// メイン在庫一覧コンテンツ
function InventoryListContent() {
  const searchParams = useSearchParams()
  const { canEditInventory } = usePermissionCheck()
  const [inventoryData, setInventoryData] = useState<InventoryItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 検索フィルタ状態（状態分離）
  const [inputFilters, setInputFilters] = useState<SearchFilters>({
    search: '',
    category: '',
    low_stock: false,
    shortage_only: false
  })
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({
    search: '',
    category: '',
    low_stock: false,
    shortage_only: false
  })

  // 検索入力フィールドのref
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // 棚卸機能の状態
  const [showStocktaking, setShowStocktaking] = useState(false)
  const [stocktakingItems, setStocktakingItems] = useState<StocktakingItem[]>([])
  const [stocktakingLoading, setStocktakingLoading] = useState(false)
  const [stocktakingError, setStocktakingError] = useState<string | null>(null)

  // 部品詳細モーダルの状態
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedPartCode, setSelectedPartCode] = useState<string>('')
  const [partDetail, setPartDetail] = useState<PartDetail | null>(null)
  const [partHistory, setPartHistory] = useState<InventoryHistory[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'detail' | 'history' | 'adjustment'>('detail')
  
  // 在庫調整フォームの状態
  const [adjustmentForm, setAdjustmentForm] = useState<AdjustmentForm>({
    transaction_type: 'receipt',
    quantity: '',
    supplier: '',
    remarks: ''
  })
  const [adjustmentLoading, setAdjustmentLoading] = useState(false)

  // debounce処理（300ms遅延）
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchFilters(inputFilters)
    }, 300)

    return () => clearTimeout(timer)
  }, [inputFilters])

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
      if (searchFilters.search.trim()) {
        params.append('search', searchFilters.search.trim())
      }
      if (searchFilters.category) {
        params.append('category', searchFilters.category)
      }
      if (searchFilters.low_stock) {
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
        if (searchFilters.shortage_only) {
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

  // 初回データ取得
  useEffect(() => {
    // URLパラメータで棚卸機能を自動的に開く
    if (searchParams.get('stocktaking') === 'true') {
      setShowStocktaking(true)
    }
  }, [searchParams])

  // 検索実行（searchFiltersが変更された時）
  useEffect(() => {
    fetchInventoryData()
  }, [searchFilters])

  // フィルタリセット
  const handleReset = () => {
    setInputFilters({
      search: '',
      category: '',
      low_stock: false,
      shortage_only: false
    })
    // searchFiltersは自動的にdebounceで更新される
  }

  // 棚卸アイテム追加
  const addStocktakingItem = () => {
    const newItem: StocktakingItem = {
      part_code: '',
      actual_quantity: 0,
      reason_code: '',
      remarks: ''
    }
    setStocktakingItems([...stocktakingItems, newItem])
  }

  // 棚卸アイテム削除
  const removeStocktakingItem = (index: number) => {
    setStocktakingItems(stocktakingItems.filter((_, i) => i !== index))
  }

  // 棚卸アイテム更新
  const updateStocktakingItem = (index: number, field: keyof StocktakingItem, value: string | number) => {
    const updatedItems = [...stocktakingItems]
    updatedItems[index] = { ...updatedItems[index], [field]: value }
    setStocktakingItems(updatedItems)
  }

  // 予約データ同期
  const syncReservations = async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      const response = await fetch('http://localhost:3000/api/inventory/sync-reservations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '予約データ同期に失敗しました')
      }

      const result = await response.json()
      
      if (result.success) {
        alert(`予約データ同期が完了しました（更新: ${result.data.updated_count}件）`)
        fetchInventoryData() // 在庫データを再取得
      } else {
        throw new Error(result.message || '予約データ同期に失敗しました')
      }

    } catch (err) {
      console.error('予約データ同期エラー:', err)
      alert(err instanceof Error ? err.message : '不明なエラーが発生しました')
    }
  }

  // 部品詳細モーダルを開く
  const openPartDetailModal = async (partCode: string) => {
    setSelectedPartCode(partCode)
    setShowDetailModal(true)
    setActiveTab('detail')
    await fetchPartDetail(partCode)
  }

  // 部品詳細データを取得
  const fetchPartDetail = async (partCode: string) => {
    try {
      setDetailLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(`http://localhost:3000/api/inventory/${partCode}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('部品詳細の取得に失敗しました')
      }
      
      const result = await response.json()
      if (result.success) {
        setPartDetail(result.data)
      } else {
        throw new Error(result.message || '部品詳細の取得に失敗しました')
      }
    } catch (err) {
      console.error('部品詳細取得エラー:', err)
      setError(err instanceof Error ? err.message : '部品詳細取得エラー')
    } finally {
      setDetailLoading(false)
    }
  }

  // 履歴データを取得
  const fetchPartHistory = async (partCode: string) => {
    try {
      setHistoryLoading(true)
      const token = localStorage.getItem('token')
      
      const response = await fetch(`http://localhost:3000/api/inventory/${partCode}/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('履歴データの取得に失敗しました')
      }
      
      const result = await response.json()
      if (result.success) {
        setPartHistory(result.data || [])
      } else {
        throw new Error(result.message || '履歴データの取得に失敗しました')
      }
    } catch (err) {
      console.error('履歴取得エラー:', err)
      setError(err instanceof Error ? err.message : '履歴取得エラー')
    } finally {
      setHistoryLoading(false)
    }
  }

  // 在庫調整実行
  const executeAdjustment = async () => {
    if (!selectedPartCode) return
    
    const quantity = parseInt(adjustmentForm.quantity)
    if (!quantity || quantity <= 0) {
      setError('数量は1以上で入力してください')
      return
    }

    const confirmed = window.confirm(
      `以下の内容で${adjustmentForm.transaction_type === 'receipt' ? '入庫' : '出庫'}処理を実行しますか？\n\n` +
      `部品コード: ${selectedPartCode}\n` +
      `数量: ${quantity}個\n` +
      `${adjustmentForm.supplier ? `仕入先: ${adjustmentForm.supplier}\n` : ''}` +
      `${adjustmentForm.remarks ? `備考: ${adjustmentForm.remarks}\n` : ''}` +
      `\n※この処理は取り消しできません。`
    )

    if (!confirmed) return

    try {
      setAdjustmentLoading(true)
      const token = localStorage.getItem('token')
      
      const endpoint = adjustmentForm.transaction_type === 'receipt' ? 'receipt' : 'issue'
      const response = await fetch(`http://localhost:3000/api/inventory/${selectedPartCode}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          quantity,
          supplier: adjustmentForm.supplier || null,
          remarks: adjustmentForm.remarks || null
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '在庫調整に失敗しました')
      }
      
      const result = await response.json()
      
      alert(
        `${adjustmentForm.transaction_type === 'receipt' ? '入庫' : '出庫'}処理が完了しました！\n\n` +
        `部品コード: ${selectedPartCode}\n` +
        `処理前在庫: ${result.old_stock}個\n` +
        `処理後在庫: ${result.new_stock}個\n` +
        `${adjustmentForm.transaction_type === 'receipt' ? '入庫' : '出庫'}数量: ${quantity}個`
      )
      
      // フォームリセット
      setAdjustmentForm({
        transaction_type: 'receipt',
        quantity: '',
        supplier: '',
        remarks: ''
      })
      
      // データ再取得
      await fetchInventoryData()
      await fetchPartDetail(selectedPartCode)
      
    } catch (err) {
      console.error('在庫調整エラー:', err)
      setError(err instanceof Error ? err.message : '在庫調整エラー')
    } finally {
      setAdjustmentLoading(false)
    }
  }

  // 棚卸実行
  const executeStocktaking = async () => {
    try {
      setStocktakingLoading(true)
      setStocktakingError(null)

      // バリデーション
      const validItems = stocktakingItems.filter(item => 
        item.part_code.trim() && item.actual_quantity >= 0
      )

      if (validItems.length === 0) {
        throw new Error('棚卸対象が指定されていません')
      }

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      const response = await fetch('http://localhost:3000/api/stocktaking/execute', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          stocktaking_items: validItems,
          stocktaking_date: new Date().toISOString().split('T')[0]
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '棚卸実行に失敗しました')
      }

      const result = await response.json()
      
      if (result.success) {
        alert(`棚卸が完了しました（処理: ${result.data.processed_count}件、差異: ${result.data.difference_count}件）`)
        setStocktakingItems([])
        setShowStocktaking(false)
        fetchInventoryData() // 在庫データを再取得
      } else {
        throw new Error(result.message || '棚卸実行に失敗しました')
      }

    } catch (err) {
      console.error('棚卸実行エラー:', err)
      setStocktakingError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setStocktakingLoading(false)
    }
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
          <Button 
            variant="danger"
            onClick={fetchInventoryData} 
            className="mt-4"
          >
            再試行
          </Button>
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
        <div className="flex items-center gap-4">
          <InventoryEditGuard>
            <Button
              variant="success"
              onClick={() => setShowStocktaking(!showStocktaking)}
            >
              {showStocktaking ? '📋 棚卸を閉じる' : '📋 棚卸'}
            </Button>
            <Button
              onClick={syncReservations}
            >
              🔄 予約データ同期
            </Button>
          </InventoryEditGuard>
          <div className="text-sm text-gray-500">
            最終更新: {new Date().toLocaleString('ja-JP')}
          </div>
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

      {/* 棚卸機能 */}
      {showStocktaking && (
        <InventoryEditGuard>
          <div className="bg-white rounded-lg shadow p-6 mb-6">
                     <div className="flex justify-between items-center mb-4">
             <div className="flex items-center gap-3">
               <h2 className="text-lg font-medium text-gray-900">📋 棚卸</h2>
               <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                 {stocktakingItems.length}件追加済み
               </span>
             </div>
             <div className="flex gap-2">
               <Button
                 onClick={addStocktakingItem}
                 size="sm"
               >
                 ➕ 部品追加
               </Button>
               <Button
                 variant="success"
                 size="sm"
                 onClick={executeStocktaking}
                 disabled={stocktakingLoading || stocktakingItems.length === 0}
               >
                 {stocktakingLoading ? '🔄 実行中...' : '✅ 棚卸実行'}
               </Button>
             </div>
           </div>

          {stocktakingError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {stocktakingError}
            </div>
          )}

          {stocktakingItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              「部品追加」ボタンで棚卸対象を追加してください
            </div>
          ) : (
            <div className="space-y-4">
              {stocktakingItems.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-sm font-medium text-gray-900">部品 {index + 1}</h3>
                    <button
                      onClick={() => removeStocktakingItem(index)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      ✕ 削除
                    </button>
                  </div>
                  
                                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                     {/* 部品コード選択 */}
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">
                         部品コード *
                       </label>
                       <PartCodeSelector
                         value={item.part_code}
                         onChange={(value) => updateStocktakingItem(index, 'part_code', value)}
                         placeholder="部品コードを選択..."
                         className="w-full"
                       />
                     </div>

                     {/* 現在在庫 */}
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">
                         現在在庫
                       </label>
                       <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-600">
                         {(() => {
                           const inventoryItem = inventoryData.find(inv => inv.part_code === item.part_code)
                           return inventoryItem ? `${inventoryItem.current_stock.toLocaleString()}個` : '不明'
                         })()}
                       </div>
                     </div>

                     {/* 実地数量 */}
                     <div>
                       <label className="block text-sm font-medium text-gray-700 mb-1">
                         実地数量 *
                       </label>
                       <input
                         type="number"
                         min="0"
                         value={item.actual_quantity}
                         onChange={(e) => updateStocktakingItem(index, 'actual_quantity', parseInt(e.target.value) || 0)}
                         className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                         placeholder="0"
                       />
                     </div>

                    {/* 差異理由 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        差異理由
                      </label>
                      <select
                        value={item.reason_code}
                        onChange={(e) => updateStocktakingItem(index, 'reason_code', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">理由なし</option>
                        <option value="盗難">盗難</option>
                        <option value="破損">破損</option>
                        <option value="計数ミス">計数ミス</option>
                        <option value="その他">その他</option>
                      </select>
                    </div>

                    {/* 備考 */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        備考
                      </label>
                      <input
                        type="text"
                        value={item.remarks}
                        onChange={(e) => updateStocktakingItem(index, 'remarks', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="備考があれば入力..."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </InventoryEditGuard>
      )}

      {/* 検索・フィルタ */}
      <SearchFiltersComponent
        filters={inputFilters}
        onFiltersChange={setInputFilters}
        categories={categories}
        onReset={handleReset}
        searchInputRef={searchInputRef}
        isSearching={loading}
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
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider ">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {inventoryData.map((item) => (
                  <tr key={item.part_code} className={getConditionalRowColor(
                    item.available_stock < 0, // 緊急条件（生産不足）
                    'danger', // 緊急時の色（赤）
                    item.is_low_stock ? 'warning' : 'normal' // 警告または通常
                  )}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div 
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => openPartDetailModal(item.part_code)}
                      >
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
                                                             <td className="px-6 py-4 whitespace-nowrap text-center">
                      <InventoryEditGuard>
                        <Button
                          onClick={() => {
                            setShowStocktaking(true)
                            // 既に追加されているかチェック
                            const isAlreadyAdded = stocktakingItems.some(
                              stockItem => stockItem.part_code === item.part_code
                            )
                            
                            if (!isAlreadyAdded) {
                              // 現在の部品を自動設定して追加
                              const newItem: StocktakingItem = {
                                part_code: item.part_code,
                                actual_quantity: item.current_stock,
                                reason_code: '',
                                remarks: ''
                              }
                              setStocktakingItems([...stocktakingItems, newItem])
                            } else {
                              // 既に追加されている場合はアラート
                              alert(`${item.part_code} は既に棚卸対象に追加されています`)
                            }
                          }}
                          size="sm"
                        >
                          📋 棚卸
                        </Button>
                      </InventoryEditGuard>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 部品詳細モーダル */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
            {/* モーダルヘッダー */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                  📦 部品詳細: {selectedPartCode}
                </h3>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* タブナビゲーション */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex space-x-4">
                <button
                  onClick={() => setActiveTab('detail')}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    activeTab === 'detail'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📋 詳細情報
                </button>
                <button
                  onClick={() => {
                    setActiveTab('history')
                    if (partHistory.length === 0) {
                      fetchPartHistory(selectedPartCode)
                    }
                  }}
                  className={`px-3 py-2 text-sm font-medium rounded-md ${
                    activeTab === 'history'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  📊 入出庫履歴
                </button>
                <InventoryEditGuard>
                  <button
                    onClick={() => setActiveTab('adjustment')}
                    className={`px-3 py-2 text-sm font-medium rounded-md ${
                      activeTab === 'adjustment'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    ⚖️ 在庫調整
                  </button>
                </InventoryEditGuard>
              </div>
            </div>

            {/* タブコンテンツ */}
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {/* 詳細情報タブ */}
              {activeTab === 'detail' && (
                <div>
                  {detailLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-gray-600 mt-2">読み込み中...</p>
                    </div>
                  ) : partDetail ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 基本情報 */}
                      <div className="space-y-4">
                        <h4 className="text-md font-semibold text-gray-900">基本情報</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">部品コード</label>
                            <div className="mt-1 text-sm text-gray-900">{partDetail.part_code}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">規格・仕様</label>
                            <div className="mt-1 text-sm text-gray-900">{partDetail.specification || '未設定'}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">カテゴリ</label>
                            <div className="mt-1 text-sm text-gray-900">{partDetail.category || '未設定'}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">仕入先</label>
                            <div className="mt-1 text-sm text-gray-900">{partDetail.supplier || '未設定'}</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">リードタイム</label>
                            <div className="mt-1 text-sm text-gray-900">{partDetail.lead_time_days}日</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">単価</label>
                            <div className="mt-1 text-sm text-gray-900">¥{partDetail.unit_price?.toLocaleString() || '未設定'}</div>
                          </div>
                        </div>
                      </div>

                      {/* 在庫情報 */}
                      <div className="space-y-4">
                        <h4 className="text-md font-semibold text-gray-900">在庫情報</h4>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">現在庫数</label>
                            <div className="mt-1 text-lg font-bold text-gray-900">{partDetail.current_stock.toLocaleString()}個</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">予約済数</label>
                            <div className="mt-1 text-sm text-gray-600">{partDetail.reserved_stock.toLocaleString()}個</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">利用可能数</label>
                            <div className={`mt-1 text-lg font-bold ${
                              partDetail.available_stock < 0 ? 'text-red-600' : 'text-green-600'
                            }`}>
                              {partDetail.available_stock.toLocaleString()}個
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">安全在庫</label>
                            <div className="mt-1 text-sm text-yellow-600">{partDetail.safety_stock.toLocaleString()}個</div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700">最終更新</label>
                            <div className="mt-1 text-xs text-gray-500">
                              {new Date(partDetail.updated_at).toLocaleString('ja-JP')}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      部品詳細の取得に失敗しました
                    </div>
                  )}
                </div>
              )}

              {/* 履歴タブ */}
              {activeTab === 'history' && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-md font-semibold text-gray-900">入出庫履歴</h4>
                    <Button
                      onClick={() => fetchPartHistory(selectedPartCode)}
                      size="sm"
                    >
                      🔄 更新
                    </Button>
                  </div>
                  
                  {historyLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="text-gray-600 mt-2">読み込み中...</p>
                    </div>
                  ) : partHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      入出庫履歴がありません
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">日時</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">処理</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">数量</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">処理前</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">処理後</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">仕入先</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">作業者</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {partHistory.map((record) => (
                            <tr key={record.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-xs text-gray-900">
                                {new Date(record.created_at || record.transaction_date || '').toLocaleString('ja-JP')}
                              </td>
                              <td className="px-3 py-2 text-xs">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  record.transaction_type === 'receipt' ? 'bg-green-100 text-green-800' :
                                  record.transaction_type === 'issue' ? 'bg-red-100 text-red-800' :
                                  record.transaction_type === 'adjustment' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {record.transaction_type === 'receipt' ? '入庫' :
                                   record.transaction_type === 'issue' ? '出庫' :
                                   record.transaction_type === 'adjustment' ? '調整' :
                                   record.transaction_type === 'stocktaking' ? '棚卸' : record.transaction_type}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-medium">
                                {record.quantity > 0 ? '+' : ''}{(record.quantity || 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-xs text-right text-gray-600">
                                {(record.before_quantity || record.before_stock || 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-medium">
                                {(record.after_quantity || record.after_stock || 0).toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {record.supplier || '-'}
                              </td>
                              <td className="px-3 py-2 text-xs text-gray-600">
                                {record.created_by}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 在庫調整タブ */}
              {activeTab === 'adjustment' && (
                <InventoryEditGuard>
                  <div>
                    <h4 className="text-md font-semibold text-gray-900 mb-4">在庫調整</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 調整フォーム */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            処理種別
                          </label>
                          <div className="flex space-x-4">
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="receipt"
                                checked={adjustmentForm.transaction_type === 'receipt'}
                                onChange={(e) => setAdjustmentForm(prev => ({ ...prev, transaction_type: e.target.value as 'receipt' | 'issue' }))}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm text-gray-700">📥 入庫</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="radio"
                                value="issue"
                                checked={adjustmentForm.transaction_type === 'issue'}
                                onChange={(e) => setAdjustmentForm(prev => ({ ...prev, transaction_type: e.target.value as 'receipt' | 'issue' }))}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="ml-2 text-sm text-gray-700">📤 出庫</span>
                            </label>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            数量 <span className="text-red-500">*</span>
                          </label>
                          <div className="flex">
                            <input
                              type="number"
                              min="1"
                              value={adjustmentForm.quantity}
                              onChange={(e) => setAdjustmentForm(prev => ({ ...prev, quantity: e.target.value }))}
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="1"
                            />
                            <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-600">個</span>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            仕入先
                          </label>
                          <input
                            type="text"
                            value={adjustmentForm.supplier}
                            onChange={(e) => setAdjustmentForm(prev => ({ ...prev, supplier: e.target.value }))}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder={adjustmentForm.transaction_type === 'receipt' ? '入庫元仕入先' : '出庫先（省略可）'}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            備考
                          </label>
                          <textarea
                            value={adjustmentForm.remarks}
                            onChange={(e) => setAdjustmentForm(prev => ({ ...prev, remarks: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="調整理由や備考があれば入力してください"
                          />
                        </div>

                        <Button
                          onClick={executeAdjustment}
                          disabled={adjustmentLoading || !adjustmentForm.quantity}
                          className="w-full"
                          isLoading={adjustmentLoading}
                        >
                          {adjustmentForm.transaction_type === 'receipt' ? '📥 入庫実行' : '📤 出庫実行'}
                        </Button>
                      </div>

                      {/* 現在の在庫状況 */}
                      <div className="space-y-4">
                        <h5 className="text-sm font-semibold text-gray-900">現在の在庫状況</h5>
                        {partDetail && (
                          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">現在庫数:</span>
                              <span className="text-sm font-medium text-gray-900">{partDetail.current_stock.toLocaleString()}個</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">予約済数:</span>
                              <span className="text-sm text-gray-600">{partDetail.reserved_stock.toLocaleString()}個</span>
                            </div>
                            <div className="flex justify-between border-t pt-2">
                              <span className="text-sm font-medium text-gray-700">利用可能数:</span>
                              <span className={`text-sm font-bold ${
                                partDetail.available_stock < 0 ? 'text-red-600' : 'text-green-600'
                              }`}>
                                {partDetail.available_stock.toLocaleString()}個
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">安全在庫:</span>
                              <span className="text-sm text-yellow-600">{partDetail.safety_stock.toLocaleString()}個</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </InventoryEditGuard>
              )}
            </div>

            {/* モーダルフッター */}
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowDetailModal(false)}
              >
                閉じる
              </Button>
            </div>
          </div>
        </div>
      )}
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