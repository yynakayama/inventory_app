'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import Button from '@/components/ui/Button'
import { useAuth } from '@/providers/AuthProvider'
import StatusBadge from '@/components/production/StatusBadge'
import SearchFiltersComponent from '@/components/production/SearchFilters'
import ProductionPlanForm from '@/components/production/ProductionPlanForm'
import { useProductionPermissions } from '@/hooks/useProductionPermissions'
import {
  ProductionPlan,
  Product,
  RequirementCalculation,
  SearchFilters,
  PlanForm
} from '@/types/production'
import { getConditionalRowColor } from '@/utils/tableRowColors'

// インポートした型定義を使用

// StatusBadgeコンポーネントはインポート済み

// useProductionPermissionsはインポート済み

// SearchFiltersComponentはインポート済み

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
  
  // 不足部材チェック結果のキャッシュ
  const [shortageCache, setShortageCache] = useState<Map<number, boolean>>(new Map())
  
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
  const fetchProductionPlans = async (searchFilters?: SearchFilters) => {
    try {
      setLoading(true)
      setError('')
      
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      // 検索フィルタ: 引数で渡されたものを優先、なければ現在のfiltersを使用
      const currentFilters = searchFilters || filters

      // 修正: クエリパラメータ構築（バックエンドAPIが期待するパラメータ名に合わせる）
      const params = new URLSearchParams()
      if (currentFilters.product_code) params.append('product_code', currentFilters.product_code)
      if (currentFilters.status) params.append('status', currentFilters.status)
      if (currentFilters.building_no) params.append('building_no', currentFilters.building_no)
      if (currentFilters.date_from) params.append('start_date_from', currentFilters.date_from)
      if (currentFilters.date_to) params.append('start_date_to', currentFilters.date_to)

      // 完了した製品の表示制御: ステータスで「完了」を選択していない場合は除外
      if (!currentFilters.status || currentFilters.status !== '完了') {
        params.append('exclude_completed', 'true')
      }

      // デバッグ用ログ
      console.log('🔍 検索実行:', { currentFilters, params: params.toString() })

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
        console.log('✅ 取得した生産計画データ:', result.data)
        const plans = result.data || []
        setProductionPlans(plans)
        console.log('✅ 検索完了:', plans.length, '件取得')
        
        // 不足部材チェックを非同期実行（バックグラウンド）
        if (plans.length > 0) {
          checkShortageForPlans(plans).catch(err => 
            console.error('不足部材チェックエラー:', err)
          )
        }
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

  // 生産計画の不足部材をチェック（軽量版）
  const checkShortageForPlan = async (planId: number): Promise<boolean> => {
    // キャッシュから確認
    if (shortageCache.has(planId)) {
      return shortageCache.get(planId)!
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/plans/${planId}/requirements`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (response.ok) {
        const result = await response.json()
        const hasShortage = result.success && result.data?.shortage_summary?.has_shortage === true
        
        // キャッシュに保存
        setShortageCache(prev => new Map(prev).set(planId, hasShortage))
        return hasShortage
      }
    } catch (error) {
      console.error(`Plan ${planId} shortage check failed:`, error)
    }
    
    return false
  }

  // 複数の生産計画の不足部材を一括チェック
  const checkShortageForPlans = async (plans: ProductionPlan[]) => {
    const activePlans = plans.filter(plan => plan.status === '計画' || plan.status === '生産中')
    
    // 最大3件まで並行処理
    const batches = []
    for (let i = 0; i < activePlans.length; i += 3) {
      batches.push(activePlans.slice(i, i + 3))
    }
    
    for (const batch of batches) {
      await Promise.all(batch.map(plan => checkShortageForPlan(plan.id)))
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
    console.log('🔍 検索ボタンクリック - 現在のフィルター:', filters)
    fetchProductionPlans(filters)
  }

  // フィルタリセット
  const handleReset = () => {
    const resetFilters = {
      product_code: '',
      status: '',
      building_no: '',
      date_from: '',
      date_to: ''
    }
    console.log('🔄 フィルターリセット')
    setFilters(resetFilters)
    
    // リセット後は自動で再検索
    setTimeout(() => {
      fetchProductionPlans(resetFilters)
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

  // 生産計画削除（データベースから完全削除）
  const handleDeletePlan = async (planId: number) => {
    // 削除対象の計画情報を取得
    const targetPlan = productionPlans.find(plan => plan.id === planId)
    const planInfo = targetPlan ? `${targetPlan.product_code} (${targetPlan.planned_quantity}個)` : `ID: ${planId}`
    
    const confirmed = window.confirm(
      `🗑️ 生産計画を削除しますか？\n\n対象: ${planInfo}\n\n※この操作は取り消せません。データは完全に削除されます。`
    )
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      const token = localStorage.getItem('token')
      
      console.log('🗑️ 生産計画削除リクエスト:', { planId, planInfo })
      
      const response = await fetch(`http://localhost:3000/api/plans/${planId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ 削除エラー:', {
          status: response.status,
          statusText: response.statusText,
          responseText: errorText
        })
        
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.message || `HTTPエラー ${response.status}: ${response.statusText}`)
        } catch (parseError) {
          throw new Error(`HTTPエラー ${response.status}: ${errorText || response.statusText}`)
        }
      }
      
      const result = await response.json()
      console.log('✅ 生産計画削除成功:', result)
      
      // 一覧を再取得して表示を更新
      await fetchProductionPlans()
      alert(`生産計画を削除しました: ${planInfo}`)
      
    } catch (err) {
      console.error('❌ 生産計画削除エラー:', err)
      setError(err instanceof Error ? err.message : '生産計画削除エラー')
    } finally {
      setLoading(false)
    }
  }

  // 生産開始処理（部材消費付き）
  const handleStartProduction = async (planId: number) => {
    const confirmed = window.confirm(
      `🚀 生産を開始しますか？\n\n※この操作により、必要な部材が在庫から消費されます。\n※操作後は元に戻せません。`
    )
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      const token = localStorage.getItem('token')
      
      console.log('🚀 生産開始リクエスト:', { planId })
      
      const response = await fetch(`http://localhost:3000/api/plans/${planId}/start-production`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ 生産開始エラー:', {
          status: response.status,
          statusText: response.statusText,
          responseText: errorText
        })
        
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.message || `HTTPエラー ${response.status}: ${response.statusText}`)
        } catch (parseError) {
          throw new Error(`HTTPエラー ${response.status}: ${errorText || response.statusText}`)
        }
      }
      
      const result = await response.json()
      console.log('✅ 生産開始成功:', result)
      
      await fetchProductionPlans()
      alert(`🚀 生産を開始しました！\n\n消費部材: ${result.data.consumption_summary.consumed_parts_count}種類\n消費数量計: ${result.data.consumption_summary.total_consumed_items}個`)
      
    } catch (err) {
      console.error('❌ 生産開始エラー:', err)
      setError(err instanceof Error ? err.message : '生産開始エラー')
    } finally {
      setLoading(false)
    }
  }

  // 生産完了処理
  const handleCompleteProduction = async (planId: number) => {
    const confirmed = window.confirm(
      `✅ 生産を完了しますか？\n\n※この操作により、生産計画のステータスが「完了」になります。`
    )
    
    if (!confirmed) return

    try {
      setLoading(true)
      
      const token = localStorage.getItem('token')
      
      console.log('✅ 生産完了リクエスト:', { planId })
      
      const response = await fetch(`http://localhost:3000/api/plans/${planId}/complete-production`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ 生産完了エラー:', {
          status: response.status,
          statusText: response.statusText,
          responseText: errorText
        })
        
        try {
          const errorData = JSON.parse(errorText)
          throw new Error(errorData.message || `HTTPエラー ${response.status}: ${response.statusText}`)
        } catch (parseError) {
          throw new Error(`HTTPエラー ${response.status}: ${errorText || response.statusText}`)
        }
      }
      
      const result = await response.json()
      console.log('✅ 生産完了成功:', result)
      
      await fetchProductionPlans()
      alert(`✅ 生産が完了しました！\n\n製品: ${result.data.product_code}\n完了数量: ${result.data.final_quantity}個`)
      
    } catch (err) {
      console.error('❌ 生産完了エラー:', err)
      setError(err instanceof Error ? err.message : '生産完了エラー')
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
                {productionPlans.map((plan) => {
                  // 不足部材がある場合の背景色決定
                  const hasShortage = shortageCache.get(plan.id) === true
                  const shouldHighlight = hasShortage && (plan.status === '計画' || plan.status === '生産中')
                  const rowColor = getConditionalRowColor(shouldHighlight, 'danger', 'normal')

                  return (
                    <tr key={plan.id} className={rowColor}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleRequirementCalculation(plan)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        🧮 所要量計算
                      </Button>
                      {canManageProduction() && plan.status === '計画' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleStartProduction(plan.id)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            🚀 生産開始
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeletePlan(plan.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            🗑️ 削除
                          </Button>
                        </>
                      )}
                      {canManageProduction() && plan.status === '生産中' && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => handleCompleteProduction(plan.id)}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            ✅ 生産完了
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleDeletePlan(plan.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            🗑️ 削除
                          </Button>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        #{plan.id}
                        {hasShortage && (plan.status === '計画' || plan.status === '生産中') && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded-full" title="部材不足あり">
                            ⚠️
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {plan.product_code}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 新規計画作成フォーム */}
      <ProductionPlanForm
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        planForm={planForm}
        setPlanForm={setPlanForm}
        products={products}
        onSubmit={handleCreatePlan}
        loading={loading}
        canManage={canManageProduction()}
      />

      {/* 所要量計算結果モーダル */}
      {showRequirementModal && selectedPlan && requirementResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">🧮 所要量計算結果</h3>
              <p className="text-sm text-gray-600 mt-1">
                計画ID: #{selectedPlan.id} | 製品: {selectedPlan.product_code} | 計画数量: {selectedPlan.planned_quantity}個
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
                        router.push('/procurement?shortage=true')
                      }}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      📝 調達管理で発注確認
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