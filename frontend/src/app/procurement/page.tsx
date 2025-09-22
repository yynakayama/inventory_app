'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard, { ProcurementEditGuard, usePermissionCheck } from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import PartCodeSelector from '@/components/ui/PartCodeSelector'
import StatusBadge from '@/components/procurement/StatusBadge'
import SearchFilters from '@/components/procurement/SearchFilters'
import { getConditionalRowColor } from '@/utils/tableRowColors'
import {
  ScheduledReceipt,
  ReceiptForm,
  DeliveryForm,
  OrderForm
} from '@/types/procurement'

// 不足部品の型定義
interface ShortagePart {
  part_code: string
  part_specification: string | null
  part_category: string | null
  supplier: string | null
  unit_price: number | null
  lead_time_days: number
  shortage_quantity: number
  current_stock: number
  total_reserved_stock: number
  available_stock: number
  procurement_due_date: string | null
  production_start_date: string | null
  product_codes: string
  total_production_quantity: number
  estimated_cost: number
  total_scheduled_receipts: number
  additional_order_needed: number
}

// インポートした型定義を使用

export default function ScheduledReceiptsPage() {
  return (
    <RouteGuard>
      <PermissionGuard requiredPermissions={['procurement.view']}>
        <ScheduledReceiptsContent />
      </PermissionGuard>
    </RouteGuard>
  )
}

function ScheduledReceiptsContent() {
  const router = useRouter()
  const { canEditProcurement } = usePermissionCheck()
  const canEdit = canEditProcurement()
  
  // 状態管理
  const [scheduledReceipts, setScheduledReceipts] = useState<ScheduledReceipt[]>([])
  const [selectedReceipt, setSelectedReceipt] = useState<ScheduledReceipt | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  
  // フィルタリング状態（状態分離）
  const [inputFilters, setInputFilters] = useState({
    status: '',
    partCode: ''
  })
  const [searchFilters, setSearchFilters] = useState({
    status: '',
    partCode: ''
  })

  // 検索入力フィールドのref
  const partCodeInputRef = useRef<HTMLInputElement | null>(null)
  
  // 不足部品一覧の状態
  const [showShortageList, setShowShortageList] = useState(false)
  const [shortagePartsList, setShortagePartsList] = useState<ShortagePart[]>([])
  const [shortageLoading, setShortageLoading] = useState(false)
  const [shortageError, setShortageError] = useState('')
  
  // モーダル状態
  const [showReceiptModal, setShowReceiptModal] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  
  // フォーム状態
  const [receiptForm, setReceiptForm] = useState<ReceiptForm>({
    actualQuantity: '',
    receiptDate: '',
    remarks: ''
  })
  
  const [deliveryForm, setDeliveryForm] = useState({
    scheduledQuantity: '',
    scheduledDate: '',
    remarks: ''
  })

  const [orderForm, setOrderForm] = useState({
    partCode: '',
    orderQuantity: '',
    scheduledDate: '',
    remarks: ''
  })

  // debounce処理（300ms遅延）
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchFilters(inputFilters)
    }, 300)

    return () => clearTimeout(timer)
  }, [inputFilters])

  // 初期化
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setReceiptForm(prev => ({ ...prev, receiptDate: today }))
  }, [])

  // 検索実行（searchFiltersが変更された時）
  useEffect(() => {
    fetchScheduledReceipts()
  }, [searchFilters])

  // 予定入荷一覧を取得
  const fetchScheduledReceipts = async () => {
    try {
      setIsLoading(true)
      setError('')
      
      const token = localStorage.getItem('token')
      let url = 'http://localhost:3000/api/scheduled-receipts'
      
      // フィルター条件を追加
      const params = new URLSearchParams()
      if (searchFilters.status) params.append('status', searchFilters.status)
      if (searchFilters.partCode) params.append('part_code', searchFilters.partCode)
      
      if (params.toString()) {
        url += '?' + params.toString()
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('予定入荷一覧の取得に失敗しました')
      }
      
      const result = await response.json()
      console.log('API Response:', result) // デバッグ用
      
      // APIレスポンス構造に対応
      if (result.success && Array.isArray(result.data)) {
        setScheduledReceipts(result.data)
      } else {
        console.error('Unexpected API response:', result)
        setScheduledReceipts([])
        setError('データの取得に失敗しました')
      }
    } catch (err) {
      console.error('fetchScheduledReceipts error:', err)
      setError(err instanceof Error ? err.message : '予定入荷一覧の取得エラー')
      setScheduledReceipts([])
    } finally {
      setIsLoading(false)
      // フォーカス復元（少し遅延させる）
      setTimeout(() => {
        const activeElement = document.activeElement?.tagName
        // フォーカスが失われている場合のみ復元
        if (!activeElement || activeElement === 'BODY') {
          if (partCodeInputRef.current) {
            partCodeInputRef.current.focus()
          }
        }
      }, 100)
    }
  }

  // 不足部品一覧を取得
  const fetchShortagePartsList = async () => {
    try {
      setShortageLoading(true)
      setShortageError('')
      
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/reports/shortage-parts/procurement-needed', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('不足部品一覧の取得に失敗しました')
      }
      
      const result = await response.json()
      
      if (result.success && result.data?.shortage_parts) {
        // APIで既に予定入荷を考慮したフィルタリング済み
        setShortagePartsList(result.data.shortage_parts)
      } else {
        console.error('Unexpected API response:', result)
        setShortagePartsList([])
        setShortageError('データの取得に失敗しました')
      }
    } catch (err) {
      console.error('fetchShortagePartsList error:', err)
      setShortageError(err instanceof Error ? err.message : '不足部品一覧の取得エラー')
      setShortagePartsList([])
    } finally {
      setShortageLoading(false)
    }
  }

  // 不足部品一覧の表示切り替え
  const handleToggleShortageList = () => {
    const newShowState = !showShortageList
    setShowShortageList(newShowState)
    
    // 表示する場合はデータを取得
    if (newShowState && shortagePartsList.length === 0) {
      fetchShortagePartsList()
    }
  }

  // リセット機能
  const handleReset = () => {
    setInputFilters({
      status: '',
      partCode: ''
    })
    // searchFiltersは自動的にdebounceで更新される
  }

  // 納期回答モーダルを開く
  const openDeliveryModal = (receipt: ScheduledReceipt) => {
    if (receipt.status !== '納期回答待ち') {
      setError('納期回答待ちの状態のみ納期設定できます')
      return
    }
    
    setSelectedReceipt(receipt)
    setDeliveryForm({
      scheduledQuantity: receipt.order_quantity.toString(),
      scheduledDate: '',
      remarks: ''
    })
    setShowDeliveryModal(true)
    setError('')
  }

  // 入荷処理モーダルを開く
  const openReceiptModal = (receipt: ScheduledReceipt) => {
    if (receipt.status !== '入荷予定') {
      setError('入荷予定の状態のみ入荷処理できます')
      return
    }
    
    setSelectedReceipt(receipt)
    setReceiptForm({
      actualQuantity: (receipt.scheduled_quantity || receipt.order_quantity).toString(),
      receiptDate: new Date().toISOString().split('T')[0],
      remarks: ''
    })
    setShowReceiptModal(true)
    setError('')
  }

  // 不足部品から発注モーダルを開く
  const openOrderModalFromShortage = (part: ShortagePart) => {
    setOrderForm({
      partCode: part.part_code,
      orderQuantity: part.additional_order_needed.toString(),
      scheduledDate: '',
      remarks: `不足部品からの発注 - 調達期限: ${part.procurement_due_date ? new Date(part.procurement_due_date).toLocaleDateString('ja-JP') : '未設定'}`
    })
    setShowOrderModal(true)
    setError('')
  }

  // 削除モーダルを開く
  const openCancelModal = (receipt: ScheduledReceipt) => {
    if (receipt.status === '入荷済み') {
      setError('入荷済みの発注は削除できません')
      return
    }
    
    setSelectedReceipt(receipt)
    setShowCancelModal(true)
    setError('')
  }

  // 新規発注処理
  const handleCreateOrder = async () => {
    const quantity = parseInt(orderForm.orderQuantity)
    
    if (!orderForm.partCode.trim()) {
      setError('部品コードを入力してください')
      return
    }
    
    if (!quantity || quantity <= 0) {
      setError('発注数量は1以上で入力してください')
      return
    }

    try {
      setIsLoading(true)
      
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/scheduled-receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          part_code: orderForm.partCode.trim(),
          order_quantity: quantity,
          scheduled_date: orderForm.scheduledDate || null,
          remarks: orderForm.remarks.trim() || null
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '発注登録に失敗しました')
      }
      
      setShowOrderModal(false)
      setOrderForm({
        partCode: '',
        orderQuantity: '',
        scheduledDate: '',
        remarks: ''
      })
      await fetchScheduledReceipts()
      
      alert('新規発注を登録しました')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '発注登録エラー')
    } finally {
      setIsLoading(false)
    }
  }

  // 納期回答処理
  const handleDeliveryResponse = async () => {
    if (!selectedReceipt) return
    
    const quantity = parseInt(deliveryForm.scheduledQuantity)
    
    if (!quantity || quantity <= 0) {
      setError('予定入荷数量は1以上で入力してください')
      return
    }
    
    if (!deliveryForm.scheduledDate) {
      setError('予定入荷日を入力してください')
      return
    }

    try {
      setIsLoading(true)
      
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/scheduled-receipts/${selectedReceipt.id}/delivery-response`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          scheduled_quantity: quantity,
          scheduled_date: deliveryForm.scheduledDate,
          remarks: deliveryForm.remarks
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '納期回答の登録に失敗しました')
      }
      
      setShowDeliveryModal(false)
      setSelectedReceipt(null)
      await fetchScheduledReceipts()
      
      alert('納期回答を登録しました')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '納期回答登録エラー')
    } finally {
      setIsLoading(false)
    }
  }

  // 入荷処理実行
  const handleReceiptProcess = async () => {
    if (!selectedReceipt) return
    
    const quantity = parseInt(receiptForm.actualQuantity)
    
    if (!quantity || quantity <= 0) {
      setError('入荷数量は1以上で入力してください')
      return
    }
    
    if (!receiptForm.receiptDate) {
      setError('入荷日を入力してください')
      return
    }

    const confirmed = window.confirm(
      `以下の内容で入荷処理を実行しますか？\n\n` +
      `部品コード: ${selectedReceipt.part_code}\n` +
      `予定数量: ${selectedReceipt.scheduled_quantity}個\n` +
      `実際数量: ${quantity}個\n` +
      `入荷日: ${receiptForm.receiptDate}\n` +
      `\n※この処理は取り消しできません。`
    )

    if (!confirmed) return

    try {
      setIsLoading(true)
      
      const token = localStorage.getItem('token')
      
      // 統合入荷処理APIを呼び出し
      const response = await fetch(`http://localhost:3000/api/inventory/${selectedReceipt.part_code}/integrated-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          quantity,
          supplier: selectedReceipt.supplier,
          receipt_date: receiptForm.receiptDate,
          remarks: receiptForm.remarks,
          scheduled_receipt_id: selectedReceipt.id
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '入荷処理に失敗しました')
      }
      
      const result = await response.json()
      
      setShowReceiptModal(false)
      setSelectedReceipt(null)
      await fetchScheduledReceipts()
      
      alert(
        `入荷処理が完了しました！\n\n` +
        `部品コード: ${result.part_code}\n` +
        `処理前在庫: ${result.old_stock}個\n` +
        `処理後在庫: ${result.new_stock}個\n` +
        `入荷数量: ${result.receipt_quantity}個`
      )
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '入荷処理エラー')
    } finally {
      setIsLoading(false)
    }
  }

  // 発注削除処理
  const handleCancelOrder = async () => {
    if (!selectedReceipt) return

    const confirmed = window.confirm(
      `以下の発注を削除しますか？\n\n` +
      `発注番号: ${selectedReceipt.order_no}\n` +
      `部品コード: ${selectedReceipt.part_code}\n` +
      `発注数量: ${selectedReceipt.order_quantity}個\n` +
      `\n※この処理は取り消しできません。`
    )

    if (!confirmed) return

    try {
      setIsLoading(true)
      
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/scheduled-receipts/${selectedReceipt.id}/cancel`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          reason: 'フロントエンドからの削除'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || '発注削除に失敗しました')
      }
      
      setShowCancelModal(false)
      setSelectedReceipt(null)
      await fetchScheduledReceipts()
      
      alert('発注を削除しました')
      
    } catch (err) {
      setError(err instanceof Error ? err.message : '発注削除エラー')
    } finally {
      setIsLoading(false)
    }
  }

  // ステータス表示用のスタイル
  // getStatusStyle関数はStatusBadgeコンポーネントに移動済み

  // サーバー側でフィルタリングされるため、取得したデータをそのまま表示
  const filteredReceipts = scheduledReceipts

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* ページヘッダー */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🚚 調達管理</h1>
          <p className="text-gray-600">発注登録から入荷処理まで調達業務を一元管理します</p>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 font-medium">⚠️ {error}</p>
          </div>
        )}

        {/* 検索フィルター */}
        <SearchFilters
          statusFilter={inputFilters.status}
          partCodeFilter={inputFilters.partCode}
          onStatusChange={(value) => setInputFilters({...inputFilters, status: value})}
          onPartCodeChange={(value) => setInputFilters({...inputFilters, partCode: value})}
          onReset={handleReset}
          onNewOrder={() => setShowOrderModal(true)}
          onToggleShortageList={handleToggleShortageList}
          showShortageList={showShortageList}
          canEdit={canEdit}
          isSearching={isLoading}
          partCodeInputRef={partCodeInputRef}
        />

        {/* 不足部品一覧 */}
        {showShortageList && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  ⚠️ 不足部品一覧 ({shortagePartsList.length}件)
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={fetchShortagePartsList}
                  disabled={shortageLoading}
                >
                  {shortageLoading ? '更新中...' : '🔄 更新'}
                </Button>
              </div>
            </div>

            {/* エラー表示 */}
            {shortageError && (
              <div className="px-6 py-4 bg-red-50 border-b border-red-200">
                <p className="text-red-600 text-sm">⚠️ {shortageError}</p>
              </div>
            )}

            <div className="overflow-x-auto">
              {shortageLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-gray-600 mt-2">読み込み中...</p>
                </div>
              ) : shortagePartsList.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600">不足部品はありません</p>
                </div>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        部品コード
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        仕様
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        仕入先
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        総不足数量
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        発注必要数量
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        現在庫数
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        調達期限
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {shortagePartsList.map((part: ShortagePart) => (
                      <tr key={part.part_code} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <ProcurementEditGuard>
                            <Button
                              variant="warning"
                              size="sm"
                              onClick={() => openOrderModalFromShortage(part)}
                            >
                              発注
                            </Button>
                          </ProcurementEditGuard>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {part.part_code}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {part.part_specification || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {part.supplier || '未設定'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                          {part.shortage_quantity}個
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-600 text-right">
                          {part.additional_order_needed}個
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {part.current_stock}個
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {part.procurement_due_date ? new Date(part.procurement_due_date).toLocaleDateString('ja-JP') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 調達管理テーブル */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              調達一覧 ({filteredReceipts.length}件)
            </h2>
          </div>
          
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">読み込み中...</p>
              </div>
            ) : filteredReceipts.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">該当する調達情報がありません</p>
                <ProcurementEditGuard>
                  <Button
                    variant="primary"
                    onClick={() => setShowOrderModal(true)}
                    className="mt-4"
                  >
                    📝 新規発注を登録
                  </Button>
                </ProcurementEditGuard>
              </div>
            ) : (
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      発注番号
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      部品コード
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      仕入先
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      発注数量
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      予定数量
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      予定入荷日
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ステータス
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredReceipts.map((receipt) => {
                    // 行の背景色を決定
                    const isOverdue = receipt.status === '入荷予定' && receipt.scheduled_date && 
                      Math.floor((new Date(receipt.scheduled_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) < 0
                    
                    const isUpcoming = receipt.status === '入荷予定' && receipt.scheduled_date && 
                      Math.floor((new Date(receipt.scheduled_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) <= 3 &&
                      Math.floor((new Date(receipt.scheduled_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) >= 0
                    
                    const rowColor = isOverdue ? getConditionalRowColor(true, 'danger', 'normal') :
                                    isUpcoming ? getConditionalRowColor(true, 'success', 'normal') :
                                    getConditionalRowColor(false)

                    return (
                      <tr key={receipt.id} className={rowColor}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          {receipt.status === '納期回答待ち' && (
                            <ProcurementEditGuard>
                              <Button
                                variant="warning"
                                size="sm"
                                onClick={() => openDeliveryModal(receipt)}
                              >
                                納期設定
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openCancelModal(receipt)}
                              >
                                キャンセル
                              </Button>
                            </ProcurementEditGuard>
                          )}
                          {receipt.status === '入荷予定' && (
                            <ProcurementEditGuard>
                              <Button
                                variant="success"
                                size="sm"
                                onClick={() => openReceiptModal(receipt)}
                              >
                                入荷処理
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => openCancelModal(receipt)}
                              >
                                キャンセル
                              </Button>
                            </ProcurementEditGuard>
                          )}
                          {receipt.status === '入荷済み' && (
                            <span className="text-green-600 text-sm">処理済み</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {receipt.order_no}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receipt.part_code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receipt.supplier}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receipt.order_quantity}個
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receipt.scheduled_quantity ? `${receipt.scheduled_quantity}個` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {receipt.scheduled_date ? new Date(receipt.scheduled_date).toLocaleDateString('ja-JP') : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={receipt.status} />
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 新規発注モーダル */}
        {showOrderModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">📝 新規発注登録</h3>
                <p className="text-sm text-gray-600 mt-1">新しい発注を登録します</p>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    部品コード <span className="text-red-500">*</span>
                  </label>
                  <PartCodeSelector
                    value={orderForm.partCode}
                    onChange={(value) => setOrderForm(prev => ({ ...prev, partCode: value }))}
                    placeholder="部材コードを入力して候補から選択..."
                    disabled={isLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">部材コードを入力すると候補が表示されます</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    発注数量 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      value={orderForm.orderQuantity}
                      onChange={(e) => setOrderForm(prev => ({ ...prev, orderQuantity: e.target.value }))}
                      min="1"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="100"
                    />
                    <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-600">個</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">入荷予定日</label>
                  <input
                    type="date"
                    value={orderForm.scheduledDate}
                    onChange={(e) => setOrderForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">納期が分かれば入力してください（入力すると納期設定をスキップできます）</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                  <textarea
                    value={orderForm.remarks}
                    onChange={(e) => setOrderForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="発注に関する備考があれば入力してください"
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleCreateOrder}
                  disabled={isLoading || !orderForm.partCode.trim() || !orderForm.orderQuantity}
                  className="flex-1"
                >
                  {isLoading ? '登録中...' : '発注登録'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowOrderModal(false)}
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 納期回答モーダル */}
        {showDeliveryModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">納期回答</h3>
                <p className="text-sm text-gray-600 mt-1">
                  発注番号: {selectedReceipt.order_no} | 部品: {selectedReceipt.part_code}
                </p>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    予定入荷数量 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      value={deliveryForm.scheduledQuantity}
                      onChange={(e) => setDeliveryForm(prev => ({ ...prev, scheduledQuantity: e.target.value }))}
                      min="1"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-600">個</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">発注数量: {selectedReceipt.order_quantity}個</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    予定入荷日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveryForm.scheduledDate}
                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                  <textarea
                    value={deliveryForm.remarks}
                    onChange={(e) => setDeliveryForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="納期回答に関する備考"
                  />
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleDeliveryResponse}
                  disabled={isLoading || !deliveryForm.scheduledQuantity || !deliveryForm.scheduledDate}
                  className="flex-1"
                >
                  {isLoading ? '処理中...' : '納期回答登録'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowDeliveryModal(false)}
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 入荷処理モーダル */}
        {showReceiptModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">入荷処理</h3>
                <p className="text-sm text-gray-600 mt-1">
                  発注番号: {selectedReceipt.order_no} | 部品: {selectedReceipt.part_code}
                </p>
              </div>
              
              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    実際入荷数量 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <input
                      type="number"
                      value={receiptForm.actualQuantity}
                      onChange={(e) => setReceiptForm(prev => ({ ...prev, actualQuantity: e.target.value }))}
                      min="1"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-600">個</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">予定数量: {selectedReceipt.scheduled_quantity}個</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    入荷日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={receiptForm.receiptDate}
                    onChange={(e) => setReceiptForm(prev => ({ ...prev, receiptDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
                  <textarea
                    value={receiptForm.remarks}
                    onChange={(e) => setReceiptForm(prev => ({ ...prev, remarks: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="入荷に関する備考"
                  />
                </div>

                {/* 在庫情報表示 */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">現在の在庫情報</h4>
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>現在庫数:</span>
                      <span>{selectedReceipt.current_stock}個</span>
                    </div>
                    <div className="flex justify-between">
                      <span>予約済数:</span>
                      <span>{selectedReceipt.reserved_stock}個</span>
                    </div>
                    <div className="flex justify-between">
                      <span>利用可能数:</span>
                      <span className={selectedReceipt.current_stock - selectedReceipt.reserved_stock < 0 ? 'text-red-600' : 'text-green-600'}>
                        {selectedReceipt.current_stock - selectedReceipt.reserved_stock}個
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
                <Button
                  variant="primary"
                  onClick={handleReceiptProcess}
                  disabled={isLoading || !receiptForm.actualQuantity || !receiptForm.receiptDate}
                  className="flex-1"
                >
                  {isLoading ? '処理中...' : '入荷処理実行'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowReceiptModal(false)}
                  disabled={isLoading}
                >
                  キャンセル
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* 削除確認モーダル */}
        {showCancelModal && selectedReceipt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">🗑️ 発注キャンセル</h3>
                <p className="text-sm text-gray-600 mt-1">
                  以下の発注を削除しますか？
                </p>
              </div>
              
              <div className="px-6 py-4">
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">発注番号:</span>
                    <span className="text-gray-900">{selectedReceipt.order_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">部品コード:</span>
                    <span className="text-gray-900">{selectedReceipt.part_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">発注数量:</span>
                    <span className="text-gray-900">{selectedReceipt.order_quantity}個</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">仕入先:</span>
                    <span className="text-gray-900">{selectedReceipt.supplier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">ステータス:</span>
                    <span className="text-gray-900">{selectedReceipt.status}</span>
                  </div>
                </div>
                
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-600 text-sm font-medium">
                    ⚠️ 注意: この操作は取り消しできません
                  </p>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
                <Button
                  variant="danger"
                  onClick={handleCancelOrder}
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? '削除中...' : '発注を削除'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isLoading}
                >
                  戻る
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}