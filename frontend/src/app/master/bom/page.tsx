'use client'

import { useState, useEffect } from 'react'
import MasterNavigationTabs from '@/components/master/MasterNavigationTabs'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'
import PartCodeSelector from '@/components/ui/PartCodeSelector'

// Interfaces
interface Product {
  product_code: string
  remarks: string | null
}
interface Station {
  station_code: string
  process_group: string
  remarks: string | null
}
interface StationAssociation {
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
  remarks: string | null
}

export default function BomPage() {
  // Global state
  const [products, setProducts] = useState<Product[]>([])
  const [allStations, setAllStations] = useState<Station[]>([])
  const [loading, setLoading] = useState({ products: false, stations: false, parts: false, allStations: false })
  const [error, setError] = useState<string | null>(null)

  // Step 1: Product Selection
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)

  // Step 2: Station Association
  const [associatedStations, setAssociatedStations] = useState<StationAssociation[]>([])
  const [availableStations, setAvailableStations] = useState<Station[]>([])

  // Step 3: Part Management
  const [managingStation, setManagingStation] = useState<StationAssociation | null>(null)
  const [bomItems, setBomItems] = useState<BomItem[]>([])

  // Modal & Form State
  const [showBomModal, setShowBomModal] = useState(false)
  const [showStationModal, setShowStationModal] = useState(false)
  const [editingBomItem, setEditingBomItem] = useState<BomItem | null>(null)
  const [bomForm, setBomForm] = useState({ part_code: '', quantity: '1', remarks: '' })
  const [selectedStationCode, setSelectedStationCode] = useState('')

  // --- API Fetching Functions ---

  const fetchProducts = async () => {
    setLoading(prev => ({ ...prev, products: true }))
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:3000/api/bom/products', { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('製品一覧の取得に失敗')
      const data = await res.json()
      if (data.success) setProducts(data.data)
      else throw new Error(data.message)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(prev => ({ ...prev, products: false })) }
  }

  const fetchAllStations = async () => {
    setLoading(prev => ({ ...prev, allStations: true }))
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('http://localhost:3000/api/bom/stations', { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('工程一覧の取得に失敗')
      const data = await res.json()
      if (data.success) setAllStations(data.data)
      else throw new Error(data.message)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(prev => ({ ...prev, allStations: false })) }
  }

  const fetchAssociatedStations = async (productCode: string) => {
    setLoading(prev => ({ ...prev, stations: true }))
    setAssociatedStations([])
    setManagingStation(null)
    setBomItems([])
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/products/${productCode}/stations`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('工程一覧の取得に失敗')
      const data = await res.json()
      if (data.success) {
        setAssociatedStations(data.data.stations)
      } else { throw new Error(data.message) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(prev => ({ ...prev, stations: false })) }
  }

  const fetchAvailableStations = async (productCode: string) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/products/${productCode}/available-stations`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('利用可能工程一覧の取得に失敗')
      const data = await res.json()
      if (data.success) {
        setAvailableStations(data.data)
      } else { throw new Error(data.message) }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }

  const fetchBomItems = async (productCode: string, stationCode: string) => {
    setLoading(prev => ({ ...prev, parts: true }))
    setBomItems([])
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/products/${productCode}/stations/${stationCode}/parts`, { headers: { 'Authorization': `Bearer ${token}` } })
      if (!res.ok) throw new Error('BOM部品一覧の取得に失敗')
      const data = await res.json()
      if (data.success) setBomItems(data.data.parts)
      else throw new Error(data.message)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(prev => ({ ...prev, parts: false })) }
  }

  // --- Event Handlers ---

  const handleProductSelect = (productCode: string) => {
    const product = products.find(p => p.product_code === productCode)
    if (product) {
      setSelectedProduct(product)
      fetchAssociatedStations(product.product_code)
      fetchAvailableStations(product.product_code)
    } else {
      setSelectedProduct(null)
      setAssociatedStations([])
      setAvailableStations([])
      setManagingStation(null)
    }
  }

  const handleManageStationParts = (station: StationAssociation) => {
    setManagingStation(station)
    if (selectedProduct) {
      fetchBomItems(selectedProduct.product_code, station.station_code)
    }
  }

  const handleAddStationAssociation = () => {
    setSelectedStationCode('')
    setShowStationModal(true)
  }

  const associateStation = async () => {
    if (!selectedProduct || !selectedStationCode) {
      alert('工程を選択してください')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/products/${selectedProduct.product_code}/stations/${selectedStationCode}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || '工程の関連付けに失敗しました')

      alert(data.message)
      setShowStationModal(false)
      fetchAssociatedStations(selectedProduct.product_code)
      fetchAvailableStations(selectedProduct.product_code)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }
  
  const handleDeleteAssociation = async (stationCode: string) => {
    if (!selectedProduct || !confirm(`製品「${selectedProduct.product_code}」から工程「${stationCode}」の関連付けを解除しますか？\nこの工程に登録されている全部品がBOMから削除されます。`)) return

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/products/${selectedProduct.product_code}/stations/${stationCode}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || '工程の関連付け解除に失敗しました')

      alert('工程の関連付けを解除しました')
      await fetchAssociatedStations(selectedProduct.product_code)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  const saveBomItem = async () => {
    if (!selectedProduct || !managingStation) return

    const url = editingBomItem
      ? `http://localhost:3000/api/bom/items/${editingBomItem.id}`
      : 'http://localhost:3000/api/bom/items'
    const method = editingBomItem ? 'PUT' : 'POST'
    const body = editingBomItem
      ? { quantity: parseInt(bomForm.quantity) || 1, remarks: bomForm.remarks }
      : { ...bomForm, product_code: selectedProduct.product_code, station_code: managingStation.station_code, quantity: parseInt(bomForm.quantity) || 1 }

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'BOM項目の保存に失敗')
      
      alert(`BOM項目を${editingBomItem ? '更新' : '追加'}しました。`)
      setShowBomModal(false)
      fetchBomItems(selectedProduct.product_code, managingStation.station_code)
      fetchAssociatedStations(selectedProduct.product_code)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  const deleteBomItem = async (itemId: number) => {
    if (!selectedProduct || !managingStation || !confirm('このBOM項目を削除しますか？')) return

    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`http://localhost:3000/api/bom/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.message || 'BOM項目の削除に失敗')

      alert('BOM項目を削除しました')
      fetchBomItems(selectedProduct.product_code, managingStation.station_code)
      fetchAssociatedStations(selectedProduct.product_code)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'エラーが発生しました')
    }
  }

  useEffect(() => {
    fetchProducts()
    fetchAllStations()
  }, [])

  return (
    <RouteGuard>
      <PermissionGuard requiredRoles={['admin']}>
        <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen space-y-6">
          <MasterNavigationTabs />
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">🔗 BOM管理</h1>
            <p className="text-gray-600">製品、工程、使用部品の関連を管理します。</p>
          </div>

          {/* Step 1: Product Selection */}
          <div className="bg-white p-6 rounded-lg shadow-sm border">
            <h2 className="text-lg font-semibold mb-4">Step 1: 製品を選択</h2>
            <select
              onChange={(e) => handleProductSelect(e.target.value)}
              className="w-full md:w-1/2 p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              defaultValue=""
            >
              <option value="" disabled>製品を選択してください...</option>
              {products.map(p => <option key={p.product_code} value={p.product_code}>{p.product_code} - {p.remarks}</option>)}
            </select>
          </div>

          {/* Step 2: Process Association */}
          {selectedProduct && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Step 2: 作業工程 ({selectedProduct.product_code})</h2>
                <Button onClick={handleAddStationAssociation}>➕ 工程を追加</Button>
              </div>
              {loading.stations ? <p>読み込み中...</p> : (
                <div className="space-y-2">
                  {associatedStations.length > 0 ? associatedStations.map(s => (
                    <div key={s.station_code} className="flex justify-between items-center p-3 bg-gray-50 rounded-md border">
                      <div>
                        <p className="font-semibold">{s.station_code} <span className="text-sm font-normal text-gray-600">({s.process_group})</span></p>
                        <p className="text-sm text-gray-500">{s.remarks}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 bg-gray-200 px-2 py-1 rounded-full">{s.parts_count} 部品</span>
                        <Button variant="outline" size="sm" onClick={() => handleManageStationParts(s)}>部品を管理</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDeleteAssociation(s.station_code)}>削除</Button>
                      </div>
                    </div>
                  )) : <p className="text-gray-500 text-center py-4">関連付けられた工程がありません。</p>}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Part Management */}
          {managingStation && selectedProduct && (
            <div className="bg-white p-6 rounded-lg shadow-sm border">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Step 3: 使用部品の管理</h2>
                  <p className="text-sm text-gray-600">{selectedProduct.product_code} &gt; {managingStation.station_code}</p>
                </div>
                <Button onClick={() => { setEditingBomItem(null); setBomForm({ part_code: '', quantity: '1', remarks: '' }); setShowBomModal(true); }}>➕ 部品を追加</Button>
              </div>
              {loading.parts ? <p>読み込み中...</p> : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50"><tr><th className="px-4 py-2 text-left">部品コード</th><th className="px-4 py-2 text-left">仕様</th><th className="px-4 py-2 text-left">数量</th><th className="px-4 py-2 text-left">操作</th></tr></thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {bomItems.length > 0 ? bomItems.map(item => (
                      <tr key={item.id}>
                        <td className="px-4 py-2 font-medium">{item.part_code}</td>
                        <td className="px-4 py-2 text-gray-600">{item.specification}</td>
                        <td className="px-4 py-2">{item.quantity} {item.unit}</td>
                        <td className="px-4 py-2 space-x-2">
                          <Button size="sm" variant="outline" onClick={() => { setEditingBomItem(item); setBomForm({ part_code: item.part_code, quantity: String(item.quantity), remarks: item.remarks || '' }); setShowBomModal(true); }}>編集</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteBomItem(item.id)}>削除</Button>
                        </td>
                      </tr>
                    )) : <tr><td colSpan={4} className="text-center py-8 text-gray-500">使用部品は登録されていません。</td></tr>}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* BOM Item Modal */}
        {showBomModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">{editingBomItem ? 'BOM項目編集' : 'BOM項目追加'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">部品コード</label>
                  <PartCodeSelector value={bomForm.part_code} onChange={(val) => setBomForm(p => ({ ...p, part_code: val }))} disabled={!!editingBomItem} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">使用数量</label>
                  <input type="number" value={bomForm.quantity} onChange={(e) => setBomForm(p => ({ ...p, quantity: e.target.value }))} className="w-full p-2 border rounded-md" min="1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                  <textarea value={bomForm.remarks} onChange={(e) => setBomForm(p => ({ ...p, remarks: e.target.value }))} className="w-full p-2 border rounded-md" rows={3} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="secondary" onClick={() => setShowBomModal(false)}>キャンセル</Button>
                <Button onClick={saveBomItem}>{editingBomItem ? '更新' : '追加'}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Station Association Modal */}
        {showStationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">工程を関連付け</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">工程を選択</label>
                  <select
                    value={selectedStationCode}
                    onChange={(e) => setSelectedStationCode(e.target.value)}
                    className="w-full p-2 border rounded-md focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">工程を選択してください...</option>
                    {availableStations.map(station => (
                      <option key={station.station_code} value={station.station_code}>
                        {station.station_code} - {station.process_group} {station.remarks && `(${station.remarks})`}
                      </option>
                    ))}
                  </select>
                  {availableStations.length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">関連付け可能な工程がありません</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="secondary" onClick={() => setShowStationModal(false)}>キャンセル</Button>
                <Button onClick={associateStation} disabled={!selectedStationCode}>追加</Button>
              </div>
            </div>
          </div>
        )}
      </PermissionGuard>
    </RouteGuard>
  )
}
