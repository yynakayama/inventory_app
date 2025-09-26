'use client'

import { useState, useEffect } from 'react'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'

interface Product {
  product_code: string
  remarks: string | null
  created_at: string
  updated_at: string
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const [showProductModal, setShowProductModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  const [productForm, setProductForm] = useState({
    product_code: '',
    remarks: ''
  })

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
      if (result.success) setProducts(result.data)
      else throw new Error(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : '製品一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleNewProduct = () => {
    setIsEditing(false)
    setProductForm({ product_code: '', remarks: '' })
    setShowProductModal(true)
  }

  const handleEditProduct = (product: Product) => {
    setIsEditing(true)
    setProductForm({ product_code: product.product_code, remarks: product.remarks || '' })
    setShowProductModal(true)
  }

  const handleDeleteProduct = async (productCode: string) => {
    if (!confirm(`製品「${productCode}」を本当に削除しますか？この操作は元に戻せません。`)) return
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:3000/api/bom/products/${productCode}`,
        { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
      )
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || '製品の削除に失敗しました')
      alert('製品を削除しました')
      await fetchProducts()
    } catch (err) {
      alert(err instanceof Error ? err.message : '製品削除エラー')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    const url = isEditing
      ? `http://localhost:3000/api/bom/products/${productForm.product_code}`
      : 'http://localhost:3000/api/bom/products'
    const method = isEditing ? 'PUT' : 'POST'

    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const response = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(productForm)
      })
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.message || `製品の${isEditing ? '更新' : '作成'}に失敗しました`)
      
      alert(`製品を${isEditing ? '更新' : '作成'}しました`)
      setShowProductModal(false)
      await fetchProducts()
    } catch (err) {
      alert(err instanceof Error ? err.message : `製品${isEditing ? '更新' : '作成'}エラー`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchProducts() }, [])

  const filteredProducts = products.filter(product =>
    searchTerm === '' ||
    product.product_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.remarks && product.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <RouteGuard>
      <PermissionGuard requiredRoles={['admin']}>
        <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">📦 製品マスタ管理</h1>
            <p className="text-gray-600">製品の基本情報を管理します。</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <input
                type="text"
                placeholder="製品コード・備考で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button onClick={handleNewProduct}>➕ 新規製品</Button>
                <Button variant="secondary" onClick={fetchProducts} isLoading={loading}>🔄 更新</Button>
              </div>
            </div>

            {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">製品コード</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">備考</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">更新日時</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && products.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8">読み込み中...</td></tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8">製品がありません。</td></tr>
                  ) : (
                    filteredProducts.map(product => (
                      <tr key={product.product_code} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{product.product_code}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{product.remarks || '-'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(product.updated_at).toLocaleString('ja-JP')}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditProduct(product)}>
                            編集
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteProduct(product.product_code)}>
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
        </div>

        {showProductModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">{isEditing ? '製品編集' : '製品新規作成'}</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">製品コード（必須）</label>
                  <input
                    type="text"
                    value={productForm.product_code}
                    onChange={(e) => setProductForm(prev => ({ ...prev, product_code: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-100"
                    placeholder="例: PROD-001"
                    disabled={isEditing}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                  <textarea
                    value={productForm.remarks}
                    onChange={(e) => setProductForm(prev => ({ ...prev, remarks: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="製品の説明など..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6 justify-end">
                <Button variant="secondary" onClick={() => setShowProductModal(false)} disabled={loading}>キャンセル</Button>
                <Button onClick={handleSubmit} disabled={!productForm.product_code.trim() || loading} isLoading={loading}>
                  {isEditing ? '更新' : '作成'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </PermissionGuard>
    </RouteGuard>
  )
}