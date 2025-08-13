'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import Button from '@/components/ui/Button'
import { useAuth } from '@/providers/AuthProvider'

// 生産計画データの型定義
interface ProductionPlan {
  id: number
  building_no: string | null
  product_code: string
  product_name: string
  planned_quantity: number
  start_date: string
  status: '計画' | '生産中' | '完了' | 'キャンセル'
  remarks: string | null
  created_by: string
  created_at: string
  updated_at: string
  // 所要量計算結果（追加情報）
  total_parts_count?: number
  shortage_parts_count?: number
  has_shortage?: boolean
}

// 製品マスタの型定義
interface Product {
  product_code: string
  product_name: string
  category: string | null
}

// 所要量計算結果の型定義
interface RequirementCalculation {
  plan_id: number
  product_code: string
  planned_quantity: number
  requirements: RequirementItem[]
  shortage_summary: {
    has_shortage: boolean
    shortage_parts_count: number
    shortage_parts: ShortageItem[]
  }
}

interface RequirementItem {
  part_code: string
  
  required_quantity: number
  current_stock: number
  total_reserved_stock: number
  plan_reserved_quantity: number
  scheduled_receipts_until_start: number
  available_stock: number
  shortage_quantity: number
  is_sufficient: boolean
  procurement_due_date: string
  supplier: string
  lead_time_days: number
  used_in_stations: any[]
}

interface ShortageItem {
  part_code: string
  shortage_quantity: number
  required_quantity: number
  available_stock: number
  stations: any[]
  procurement_due_date: string
  supplier: string
  lead_time_days: number
}

// 検索フィルタの型定義
interface SearchFilters {
  product_code: string
  status: string
  building_no: string
  date_from: string
  date_to: string
}

// 新規計画フォームの型定義
interface PlanForm {
  building_no: string
  product_code: string
  planned_quantity: string
  start_date: string
  remarks: string
}

// ステータス表示コンポーネント
interface StatusBadgeProps {
  status: string
}

function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case '計画':
        return 'bg-blue-100 text-blue-800'
      case '生産中':
        return 'bg-yellow-100 text-yellow-800'
      case '完了':
        return 'bg-green-100 text-green-800'
      case 'キャンセル':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case '計画':
        return '📋'
      case '生産中':
        return '🔄'
      case '完了':
        return '✅'
      case 'キャンセル':
        return '❌'
      default:
        return '📋'
    }
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusStyle(status)}`}>
      {getStatusIcon(status)} {status}
    </span>
  )
}

// 権限チェック用カスタムフック
function useProductionPermissions() {
  const { user } = useAuth()
  
  const canManageProduction = () => {
    if (!user?.role) return false
    return ['admin', 'production_manager'].includes(user.role)
  }

  const canViewProduction = () => {
    if (!user?.role) return false
    return ['admin', 'production_manager', 'material_staff', 'viewer'].includes(user.role)
  }

  return {
    canManageProduction,
    canViewProduction,
    isProductionManager: canManageProduction,
    isViewer: !canManageProduction()
  }
}

// 検索・フィルターコンポーネント
interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  products: Product[]
  onSearch: () => void
  onReset: () => void
}

function SearchFiltersComponent({ filters, onFiltersChange, products, onSearch, onReset }: SearchFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 製品コード */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            製品コード
          </label>
          <select
            value={filters.product_code}
            onChange={(e) => onFiltersChange({ ...filters, product_code: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">すべての製品</option>
            {products.map((product) => (
              <option key={product.product_code} value={product.product_code}>
                {product.product_code} - {product.product_name}
              </option>
            ))}
          </select>
        </div>

        {/* ステータス */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ステータス
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">すべてのステータス</option>
            <option value="計画">📋 計画</option>
            <option value="生産中">🔄 生産中</option>
            <option value="完了">✅ 完了</option>
            <option value="キャンセル">❌ キャンセル</option>
          </select>
        </div>

        {/* 棟番号 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            棟番号
          </label>
          <input
            type="text"
            value={filters.building_no}
            onChange={(e) => onFiltersChange({ ...filters, building_no: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="棟番号で検索"
          />
        </div>

        {/* 開始日（From） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            開始日（From）
          </label>
          <input
            type="date"
            value={filters.date_from}
            onChange={(e) => onFiltersChange({ ...filters, date_from: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 開始日（To） */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            開始日（To）
          </label>
          <input
            type="date"
            value={filters.date_to}
            onChange={(e) => onFiltersChange({ ...filters, date_to: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="flex justify-end space-x-2 mt-4">
        <Button
          variant="secondary"
          onClick={onReset}
        >
          リセット
        </Button>
        <Button
          onClick={onSearch}
        >
          🔍 検索
        </Button>
      </div>
    </div>
  )
}

// メイン生産計画管理コンテンツ
function ProductionPlansContent() {
  const router = useRouter()
  const { canManageProduction, isViewer } = useProductionPermissions()
  
  // 状態管理
  const [productionPlans, setProductionPlans] = useState<ProductionPlan[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [selectedPlan, setSelectedPlan] = useState<ProductionPlan | null>(null)
  const [requirementResult, setRequirementResult] = useState<RequirementCalculation | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // フィルタリング状態
  const [filters, setFilters] = useState<SearchFilters>({
    product_code: '',
    status: '',
    building_no: '',
    date_from: '',
    date_to: ''
  })
  
  // モーダル状態
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showRequirementModal, setShowRequirementModal] = useState(false)
  
  // フォーム状態
  const [planForm, setPlanForm] = useState<PlanForm>({
    building_no: '',
    product_code: '',
    planned_quantity: '',
    start_date: '',
    remarks: ''
  })

  // 初期化
  useEffect(() => {
    fetchProductionPlans()
    fetchProducts()
    
    // デフォルトの開始日を今日に設定
    const today = new Date().toISOString().split('T')[0]
    setPlanForm(prev => ({ ...prev, start_date: today }))
  }, [])

  // 生産計画一覧を取得
  const fetchProductionPlans = async () => {
    try {
      setLoading(true)
      setError('')
      
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      // クエリパラメータ構築
      const params = new URLSearchParams()
      if (filters.product_code) params.append('product_code', filters.product_code)
      if (filters.status) params.append('status', filters.status)
      if (filters.building_no) params.append('building_no', filters.building_no)
      if (filters.date_from) params.append('start_date_from', filters.date_from)
      if (filters.date_to) params.append('start_date_to', filters.date_to)

      const response = await fetch(`http://localhost:3000/api/plans?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`生産計画データの取得に失敗しました: ${response.status}`)
      }

      const result = await response.json()
      if (result.success) {
        setProductionPlans(result.data || [])
      } else {
        throw new Error(result.message || 'データ取得に失敗しました')
      }

    } catch (err) {
      console.error('生産計画データ取得エラー:', err)
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  // 製品マスタを取得
  const fetchProducts = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/bom/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (response.ok) {
        const result = await response.json()
        setProducts(result.data || [])
      }
    } catch (error) {
      console.error('製品マスタ取得エラー:', error)
    }
  }

  // 検索実行
  const handleSearch = () => {
    fetchProductionPlans()
  }

  // フィルタリセット
  const handleReset = () => {
    setFilters({
      product_code: '',
      status: '',
      building_no: '',
      date_from: '',
      date_to: ''
    })
    
    // リセット後は自動で再検索
    setTimeout(() => {
      fetchProductionPlans()
    }, 100)
  }

  // 新規計画作成
  const handleCreatePlan = async () => {
    const quantity = parseInt(planForm.planned_quantity)
    
    if (!planForm.product_code.trim()) {
      setError('製品コードを選択してください')
      return
    }
    
    if (!quantity || quantity <= 0) {
      setError('計画数量は1以上で入力してください')
      return
    }

    if (!planForm.start_date) {
      setError('開始予定日を入力してください')
      return
    }

    try {
      setLoading(true)
      
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          building_no: planForm.building_no.trim() || null,
          product_code: planForm.product_code.trim(),
          planned_quantity: quantity,
          start_date: planForm.start_date,
          remarks: planForm.remarks.trim() || null
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '生産計画の作成に失敗しました')
      }
      
      setShowCreateModal(false)
      setPlanForm({
        building_no: '',
        product_code: '',
        planned_quantity: '',
        start_date: new Date().toISOString().split('T')[0],
        remarks: ''
      })
      await fetchProductionPlans()
      
      alert('新規生産計画を作成しました')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '生産計画作成エラー')
    } finally {
      setLoading(false)
    }
  }

  // 所要量計算
  const handleRequirementCalculation = async (plan: ProductionPlan) => {
    try {
      setLoading(true)
      setError('')
      setSelectedPlan(plan)
      
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/plans/${plan.id}/requirements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '所要量計算に失敗しました')
      }
      
      const result = await response.json()
      if (result.success) {
        setRequirementResult(result.data)
        setShowRequirementModal(true)
      } else {
        throw new Error(result.message || '所要量計算に失敗しました')
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '所要量計算エラー')
    } finally {
      setLoading(false)
    }
  }

  // ステータス更新
  const handleStatusChange = async (planId: number, newStatus: string) => {
    const confirmed = window.confirm(
      `ステータスを「${newStatus}」に変更しますか？`
    )
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'ステータス更新に失敗しました')
      }
      
      await fetchProductionPlans()
      alert(`ステータスを「${newStatus}」に更新しました`)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ステータス更新エラー')
    } finally {
      setLoading(false)
    }
  }

  // ローディング状態
  if (loading && productionPlans.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">生産計画管理</h1>
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

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏭 生産計画管理</h1>
          <p className="text-gray-600 mt-1">生産計画の作成・管理と所要量計算を行います</p>
        </div>
        <div className="flex items-center gap-4">
          {canManageProduction() && (
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              📋 新規計画作成
            </Button>
          )}
          <div className="text-sm text-gray-500">
            最終更新: {new Date().toLocaleString('ja-JP')}
          </div>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 font-medium">⚠️ {error}</p>
        </div>
      )}

      {/* 検索・フィルター */}
      <SearchFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        products={products}
        onSearch={handleSearch}
        onReset={handleReset}
      />

      {/* 生産計画テーブル */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            生産計画一覧 ({productionPlans.length}件)
          </h2>
        </div>

        {productionPlans.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            検索条件に該当する生産計画がありません
            {canManageProduction() && (
              <div className="mt-4">
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  📋 新規計画を作成
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    計画ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    製品コード
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    製品名
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    計画数量
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    開始予定日
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ステータス
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    棟番号
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    作成者
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {productionPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleRequirementCalculation(plan)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        🧮 所要量計算
                      </Button>
                      {canManageProduction() && plan.status === '計画' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(plan.id, '生産中')}
                          className="bg-yellow-600 hover:bg-yellow-700"
                        >
                          🔄 開始
                        </Button>
                      )}
                      {canManageProduction() && plan.status === '生産中' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(plan.id, '完了')}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          ✅ 完了
                        </Button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{plan.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.product_code}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {plan.product_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {plan.planned_quantity.toLocaleString()}個
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(plan.start_date).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={plan.status} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.building_no || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {plan.created_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新規計画作成モーダル */}
      {showCreateModal && canManageProduction() && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">📋 新規生産計画作成</h3>
              <p className="text-sm text-gray-600 mt-1">新しい生産計画を作成します</p>
            </div>
            
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  製品コード <span className="text-red-500">*</span>
                </label>
                <select
                  value={planForm.product_code}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, product_code: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">製品を選択してください</option>
                  {products.map((product) => (
                    <option key={product.product_code} value={product.product_code}>
                      {product.product_code} - {product.product_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  計画数量 <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <input
                    type="number"
                    value={planForm.planned_quantity}
                    onChange={(e) => setPlanForm(prev => ({ ...prev, planned_quantity: e.target.value }))}
                    min="1"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="100"
                  />
                  <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-600">個</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  開始予定日 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={planForm.start_date}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, start_date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">棟番号</label>
                <input
                  type="text"
                  value={planForm.building_no}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, building_no: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="A棟、B棟など"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                <textarea
                  value={planForm.remarks}
                  onChange={(e) => setPlanForm(prev => ({ ...prev, remarks: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="生産計画に関する備考があれば入力してください"
                />
              </div>
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <Button
                onClick={handleCreatePlan}
                disabled={loading || !planForm.product_code.trim() || !planForm.planned_quantity || !planForm.start_date}
                className="flex-1"
              >
                {loading ? '作成中...' : '生産計画作成'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={loading}
              >
                キャンセル
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 所要量計算結果モーダル */}
      {showRequirementModal && selectedPlan && requirementResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">🧮 所要量計算結果</h3>
              <p className="text-sm text-gray-600 mt-1">
                計画ID: #{selectedPlan.id} | 製品: {selectedPlan.product_code} - {selectedPlan.product_name} | 計画数量: {selectedPlan.planned_quantity}個
              </p>
            </div>
            
            <div className="px-6 py-4">
              {/* 不足部品サマリー */}
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-900 mb-3">📊 不足部品サマリー</h4>
                {requirementResult.shortage_summary.has_shortage ? (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center mb-2">
                      <span className="text-red-600 font-medium">⚠️ 部品不足が発生しています</span>
                    </div>
                    <p className="text-sm text-red-700 mb-3">
                      {requirementResult.shortage_summary.shortage_parts_count}種類の部品で不足が発生しています。
                      生産開始前に発注が必要です。
                    </p>
                    
                    <div className="space-y-2">
                      {requirementResult.shortage_summary.shortage_parts.map((shortage, index) => (
                        <div key={index} className="bg-white rounded p-3 border border-red-200">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-gray-900">{shortage.part_code}</div>
                              <div className="text-sm text-gray-600">仕入先: {shortage.supplier || '未設定'}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-red-600 font-medium">不足: {shortage.shortage_quantity.toLocaleString()}個</div>
                              <div className="text-sm text-gray-600">必要: {shortage.required_quantity.toLocaleString()}個</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <span className="text-green-600 font-medium">✅ すべての部品が充足しています</span>
                    </div>
                    <p className="text-sm text-green-700 mt-1">
                      現在の在庫で生産可能です。
                    </p>
                  </div>
                )}
              </div>

              {/* 詳細な所要量一覧 */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">📋 部品別所要量詳細</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          部品コード
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          必要数量
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          現在在庫
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          予約済
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          利用可能
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          不足数量
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b">
                          状態
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {requirementResult.requirements.map((req, index) => (
                        <tr key={index} className={req.shortage_quantity > 0 ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {req.part_code}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {req.required_quantity.toLocaleString()}個
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">
                            {req.current_stock.toLocaleString()}個
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-500">
                            {req.total_reserved_stock.toLocaleString()}個
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={req.available_stock < 0 ? 'text-red-600' : 'text-gray-900'}>
                              {req.available_stock.toLocaleString()}個
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {req.shortage_quantity > 0 ? (
                              <span className="text-red-600 font-medium">
                                {req.shortage_quantity.toLocaleString()}個
                              </span>
                            ) : (
                              <span className="text-green-600">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {req.shortage_quantity > 0 ? (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
                                🔴 不足
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                ✅ 充足
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 不足部品への対応アクション */}
              {requirementResult.shortage_summary.has_shortage && canManageProduction() && (
                <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-yellow-800 mb-2">💡 推奨アクション</h4>
                  <div className="text-sm text-yellow-700 space-y-2">
                    <p>• 不足部品の発注を行ってください</p>
                    <p>• 代替部品の使用可能性を検討してください</p>
                    <p>• 生産スケジュールの調整を検討してください</p>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      onClick={() => {
                        setShowRequirementModal(false)
                        router.push('/procurement/scheduled?shortage=true')
                      }}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      📝 調達管理で発注登録
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowRequirementModal(false)}
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

// メイン生産計画管理ページ
export default function ProductionPlansPage() {
  return (
    <RouteGuard>
      <ProductionPlansContent />
    </RouteGuard>
  )
}