'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'
import PartCodeSelector from '@/components/ui/PartCodeSelector'

interface Product {
  product_code: string
  remarks: string | null
  created_at: string
  updated_at: string
}

interface WorkStation {
  station_code: string
  process_group: string
  remarks: string | null
  parts_count: number
}

interface BomItem {
  id: number
  part_code: string
  specification: string | null
  quantity: number
  unit: string
  supplier: string | null
  lead_time_days: number
  remarks: string | null
  created_at: string
  updated_at: string
}

interface Station {
  station_code: string
  process_group: string
  remarks: string | null
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [stations, setStations] = useState<WorkStation[]>([])
  const [selectedStation, setSelectedStation] = useState<string>('')
  const [bomItems, setBomItems] = useState<BomItem[]>([])
  const [allStations, setAllStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // モーダル状態
  const [showProductModal, setShowProductModal] = useState(false)
  const [showBomModal, setShowBomModal] = useState(false)
  const [editingBomItem, setEditingBomItem] = useState<BomItem | null>(null)

  // フォーム状態
  const [productForm, setProductForm] = useState({
    product_code: '',
    remarks: ''
  })
  const [bomForm, setBomForm] = useState({
    part_code: '',
    quantity: '',
    remarks: ''
  })

  // 製品一覧を取得
  const fetchProducts = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/bom/products', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('製品一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) {
        setProducts(result.data)
      } else {
        throw new Error(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '製品一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  // 選択製品の工程一覧を取得
  const fetchStations = async (productCode: string) => {
    try {
      setLoading(true)

      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/bom/products/${encodeURIComponent(productCode)}/stations`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('工程一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) {
        setStations(result.data.stations)
        // 最初の工程を選択
        if (result.data.stations.length > 0) {
          setSelectedStation(result.data.stations[0].station_code)
        } else {
          setSelectedStation('')
          setBomItems([])
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '工程一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  // 工程の使用部品一覧を取得
  const fetchBomItems = async (productCode: string, stationCode: string) => {
    try {
      setLoading(true)

      const token = localStorage.getItem('token')
      const response = await fetch(
        `http://localhost:3000/api/bom/products/${encodeURIComponent(productCode)}/stations/${encodeURIComponent(stationCode)}/parts`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      )

      if (!response.ok) throw new Error('使用部品一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) {
        setBomItems(result.data.parts)
      } else {
        setBomItems([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '使用部品一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  // 全工程一覧を取得
  const fetchAllStations = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/bom/stations', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('工程一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) {
        setAllStations(result.data)
      }
    } catch (err) {
      console.error('工程一覧取得エラー:', err)
    }
  }

  // 製品を選択
  const selectProduct = async (product: Product) => {
    setSelectedProduct(product)
    await fetchStations(product.product_code)
  }

  // 工程を選択
  const selectStation = async (stationCode: string) => {
    setSelectedStation(stationCode)
    if (selectedProduct) {
      await fetchBomItems(selectedProduct.product_code, stationCode)
    }
  }

  // 製品新規作成
  const createProduct = async () => {
    try {
      setLoading(true)

      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/bom/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productForm)
      })

      if (!response.ok) throw new Error('製品の作成に失敗しました')

      const result = await response.json()
      if (result.success) {
        await fetchProducts()
        setShowProductModal(false)
        setProductForm({ product_code: '', remarks: '' })
        alert('製品を作成しました')
      } else {
        throw new Error(result.message)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '製品作成エラー')
    } finally {
      setLoading(false)
    }
  }

  // BOM項目追加/更新
  const saveBomItem = async () => {
    if (!selectedProduct || !selectedStation) return

    try {
      setLoading(true)

      const token = localStorage.getItem('token')

      if (editingBomItem) {
        // 更新
        const response = await fetch(`http://localhost:3000/api/bom/items/${editingBomItem.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            quantity: parseInt(bomForm.quantity) || 1,
            remarks: bomForm.remarks
          })
        })

        if (!response.ok) throw new Error('BOM項目の更新に失敗しました')

        const result = await response.json()
        if (result.success) {
          await fetchBomItems(selectedProduct.product_code, selectedStation)
          alert('BOM項目を更新しました')
        } else {
          throw new Error(result.message)
        }
      } else {
        // 追加
        const response = await fetch('http://localhost:3000/api/bom/items', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            product_code: selectedProduct.product_code,
            station_code: selectedStation,
            part_code: bomForm.part_code,
            quantity: parseInt(bomForm.quantity) || 1,
            remarks: bomForm.remarks
          })
        })

        if (!response.ok) throw new Error('BOM項目の追加に失敗しました')

        const result = await response.json()
        if (result.success) {
          await fetchBomItems(selectedProduct.product_code, selectedStation)
          await fetchStations(selectedProduct.product_code) // 部品数更新のため工程も再取得
          alert('BOM項目を追加しました')
        } else {
          throw new Error(result.message)
        }
      }

      setShowBomModal(false)
      setBomForm({ part_code: '', quantity: '', remarks: '' })
      setEditingBomItem(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'BOM項目の保存エラー')
    } finally {
      setLoading(false)
    }
  }

  // BOM項目削除
  const deleteBomItem = async (item: BomItem) => {
    if (!confirm(`部品「${item.part_code}」を削除しますか？`)) return

    try {
      setLoading(true)

      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/bom/items/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('BOM項目の削除に失敗しました')

      const result = await response.json()
      if (result.success && selectedProduct) {
        await fetchBomItems(selectedProduct.product_code, selectedStation)
        await fetchStations(selectedProduct.product_code) // 部品数更新のため工程も再取得
        alert('BOM項目を削除しました')
      } else {
        throw new Error(result.message)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'BOM項目の削除エラー')
    } finally {
      setLoading(false)
    }
  }

  // BOM編集ダイアログを開く
  const openEditBomDialog = (item: BomItem) => {
    setEditingBomItem(item)
    setBomForm({
      part_code: item.part_code,
      quantity: item.quantity.toString(),
      remarks: item.remarks || ''
    })
    setShowBomModal(true)
  }

  // BOM追加ダイアログを開く
  const openAddBomDialog = () => {
    setEditingBomItem(null)
    setBomForm({ part_code: '', quantity: '', remarks: '' })
    setShowBomModal(true)
  }

  // 初期化
  useEffect(() => {
    fetchProducts()
    fetchAllStations()
  }, [])

  // 工程選択時に部品一覧を取得
  useEffect(() => {
    if (selectedProduct && selectedStation) {
      fetchBomItems(selectedProduct.product_code, selectedStation)
    }
  }, [selectedProduct, selectedStation])

  const filteredProducts = products.filter(product =>
    searchTerm === '' ||
    product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.remarks && product.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <RouteGuard>
      <PermissionGuard requiredRoles={['admin', 'production_manager']}>
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto p-6">
            {/* ページヘッダー */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">📦 製品・BOM管理</h1>
              <p className="text-gray-600">製品マスターとBOM（部品表）を管理します</p>
            </div>

            {/* アクションバー */}
            <div className="mb-4 flex gap-2">
              <Button onClick={() => setShowProductModal(true)}>
                ➕ 新規製品
              </Button>
              <Button variant="secondary" onClick={fetchProducts}>
                🔄 更新
              </Button>
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">
                {error}
              </div>
            )}

            {/* メインコンテンツ（2ペイン構成） */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* 左ペイン: 製品一覧 */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">製品一覧</h2>
                  <input
                    type="text"
                    placeholder="製品コード・備考で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {loading && products.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                      読み込み中...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      {searchTerm ? '検索条件に一致する製品がありません' : '製品が登録されていません'}
                    </div>
                  ) : (
                    filteredProducts.map(product => (
                      <button
                        key={product.product_code}
                        onClick={() => selectProduct(product)}
                        className={`w-full p-4 text-left border-b border-gray-100 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors ${
                          selectedProduct?.product_code === product.product_code ? 'bg-blue-100' : ''
                        }`}
                      >
                        <div className="font-semibold text-gray-900">{product.product_code}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {product.remarks || '備考なし'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          作成: {new Date(product.created_at).toLocaleDateString()}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* 右ペイン: BOM詳細 */}
              <div className="lg:col-span-3 bg-white rounded-lg shadow-sm border border-gray-200">
                {selectedProduct ? (
                  <>
                    {/* 製品情報 */}
                    <div className="p-4 border-b border-gray-200">
                      <h2 className="text-lg font-semibold text-gray-900">
                        📦 製品: {selectedProduct.product_code}
                      </h2>
                      <p className="text-gray-600">{selectedProduct.remarks || '備考なし'}</p>
                    </div>

                    {/* 工程タブ */}
                    <div className="border-b border-gray-200">
                      <div className="flex overflow-x-auto">
                        {stations.map(station => (
                          <button
                            key={station.station_code}
                            onClick={() => selectStation(station.station_code)}
                            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                              selectedStation === station.station_code
                                ? 'border-blue-500 text-blue-600 bg-blue-50'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                          >
                            {station.station_code}
                            {station.parts_count > 0 && (
                              <span className="ml-1 px-2 py-1 text-xs bg-gray-200 text-gray-600 rounded-full">
                                {station.parts_count}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* BOM テーブル */}
                    {selectedStation ? (
                      <div className="p-4">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="font-semibold text-gray-900">
                            使用部品一覧 - {selectedStation}
                          </h3>
                          <Button size="sm" onClick={openAddBomDialog}>
                            ➕ 部品追加
                          </Button>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  部品コード
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  仕様
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  数量
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  単位
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  操作
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {bomItems.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                    {loading ? '読み込み中...' : '使用部品が登録されていません'}
                                  </td>
                                </tr>
                              ) : (
                                bomItems.map(item => (
                                  <tr key={item.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                      {item.part_code}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-gray-500">
                                      {item.specification || '-'}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                                      {item.quantity}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                                      {item.unit}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-sm space-x-2">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => openEditBomDialog(item)}
                                      >
                                        編集
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="danger"
                                        onClick={() => deleteBomItem(item)}
                                      >
                                        削除
                                      </Button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        工程を選択してください
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    製品を選択してください
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 製品新規作成モーダル */}
        {showProductModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">📦 製品新規作成</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    製品コード（必須）
                  </label>
                  <input
                    type="text"
                    value={productForm.product_code}
                    onChange={(e) => setProductForm(prev => ({ ...prev, product_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="例: PROD-001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    備考
                  </label>
                  <textarea
                    value={productForm.remarks}
                    onChange={(e) => setProductForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="製品の説明など..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowProductModal(false)
                    setProductForm({ product_code: '', remarks: '' })
                  }}
                  disabled={loading}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={createProduct}
                  disabled={!productForm.product_code.trim() || loading}
                  isLoading={loading}
                >
                  作成
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* BOM項目追加/編集モーダル */}
        {showBomModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                ➕ {editingBomItem ? 'BOM項目編集' : 'BOM項目追加'}
              </h3>
              <div className="space-y-4">
                {!editingBomItem && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      部品コード（必須）
                    </label>
                    <PartCodeSelector
                      value={bomForm.part_code}
                      onChange={(value) => setBomForm(prev => ({ ...prev, part_code: value }))}
                      placeholder="部品を選択してください..."
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    使用数量（必須）
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={bomForm.quantity}
                    onChange={(e) => {
                      const value = e.target.value
                      // 空文字または正の整数のみ許可
                      if (value === '' || (/^\d+$/.test(value) && parseInt(value) > 0)) {
                        setBomForm(prev => ({ ...prev, quantity: value }))
                      }
                    }}
                    onBlur={(e) => {
                      // フォーカスが外れた時、空の場合は1にセット
                      if (e.target.value === '') {
                        setBomForm(prev => ({ ...prev, quantity: '1' }))
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    備考
                  </label>
                  <textarea
                    value={bomForm.remarks}
                    onChange={(e) => setBomForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="備考があれば入力..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowBomModal(false)
                    setBomForm({ part_code: '', quantity: '', remarks: '' })
                    setEditingBomItem(null)
                  }}
                  disabled={loading}
                >
                  キャンセル
                </Button>
                <Button
                  onClick={saveBomItem}
                  disabled={
                    (!editingBomItem && !bomForm.part_code.trim()) ||
                    !bomForm.quantity ||
                    parseInt(bomForm.quantity) <= 0 ||
                    loading
                  }
                  isLoading={loading}
                >
                  {editingBomItem ? '更新' : '追加'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PermissionGuard>
    </RouteGuard>
  )
}