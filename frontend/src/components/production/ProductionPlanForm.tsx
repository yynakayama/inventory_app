import Button from '@/components/ui/Button'
import { PlanForm, Product } from '@/types/production'

interface ProductionPlanFormProps {
  isOpen: boolean
  onClose: () => void
  planForm: PlanForm
  setPlanForm: (form: PlanForm | ((prev: PlanForm) => PlanForm)) => void
  products: Product[]
  onSubmit: () => void
  loading: boolean
  canManage: boolean
}

export default function ProductionPlanForm({
  isOpen,
  onClose,
  planForm,
  setPlanForm,
  products,
  onSubmit,
  loading,
  canManage
}: ProductionPlanFormProps) {
  if (!isOpen || !canManage) return null

  return (
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
              onChange={(e) => {
                const newValue = e.target.value
                console.log('⌨️ 入力変更:', { field: 'product_code', value: newValue })
                setPlanForm(prev => ({ ...prev, product_code: newValue }))
              }}
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
                onChange={(e) => {
                  const newValue = e.target.value
                  console.log('⌨️ 入力変更:', { field: 'planned_quantity', value: newValue })
                  setPlanForm(prev => ({ ...prev, planned_quantity: newValue }))
                }}
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
              onChange={(e) => {
                const newValue = e.target.value
                console.log('⌨️ 入力変更:', { field: 'start_date', value: newValue })
                setPlanForm(prev => ({ ...prev, start_date: newValue }))
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">棟番号</label>
            <input
              type="text"
              value={planForm.building_no}
              onChange={(e) => {
                const newValue = e.target.value
                console.log('⌨️ 入力変更:', { field: 'building_no', value: newValue })
                setPlanForm(prev => ({ ...prev, building_no: newValue }))
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="A棟、B棟など"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">備考</label>
            <textarea
              value={planForm.remarks}
              onChange={(e) => {
                const newValue = e.target.value
                console.log('⌨️ 入力変更:', { field: 'remarks', value: newValue })
                setPlanForm(prev => ({ ...prev, remarks: newValue }))
              }}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="生産計画に関する備考があれば入力してください"
            />
          </div>
        </div>
        
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <Button
            onClick={onSubmit}
            disabled={loading || !planForm.product_code.trim() || !planForm.planned_quantity || !planForm.start_date}
            className="flex-1"
          >
            {loading ? '作成中...' : '生産計画作成'}
          </Button>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            キャンセル
          </Button>
        </div>
      </div>
    </div>
  )
}