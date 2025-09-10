import Button from '@/components/ui/Button'
import PartCodeSelector from '@/components/ui/PartCodeSelector'

interface SearchFiltersProps {
  statusFilter: string
  partCodeFilter: string
  onStatusChange: (value: string) => void
  onPartCodeChange: (value: string) => void
  onReset: () => void
  onNewOrder: () => void
  canEdit: boolean
}

export default function SearchFilters({
  statusFilter,
  partCodeFilter,
  onStatusChange,
  onPartCodeChange,
  onReset,
  onNewOrder,
  canEdit
}: SearchFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* 新規発注ボタン */}
          <div>
            {canEdit && (
              <Button
                onClick={onNewOrder}
                className="bg-blue-600 hover:bg-blue-700"
              >
                📝 新規発注
              </Button>
            )}
          </div>
          
          {/* フィルター */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 lg:max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ステータス</label>
              <select
                value={statusFilter}
                onChange={(e) => onStatusChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全て</option>
                <option value="納期回答待ち">納期回答待ち</option>
                <option value="入荷予定">入荷予定</option>
                <option value="入荷済み">入荷済み</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">部品コード</label>
              <PartCodeSelector
                value={partCodeFilter}
                onChange={onPartCodeChange}
                placeholder="部品コードで検索"
                className="w-full"
              />
            </div>
            
            <div className="flex items-end">
              <Button
                variant="secondary"
                onClick={onReset}
                className="w-full"
              >
                🔄 リセット
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}