import Button from '@/components/ui/Button'
import { SearchFilters, Product } from '@/types/production'

interface SearchFiltersProps {
  filters: SearchFilters
  onFiltersChange: (filters: SearchFilters) => void
  products: Product[]
  onSearch: () => void
  onReset: () => void
}

export default function SearchFiltersComponent({ filters, onFiltersChange, products, onSearch, onReset }: SearchFiltersProps) {
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