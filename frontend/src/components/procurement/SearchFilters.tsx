import Button from '@/components/ui/Button'
import PartCodeSelector from '@/components/ui/PartCodeSelector'

interface SearchFiltersProps {
  statusFilter: string
  partCodeFilter: string
  onStatusChange: (value: string) => void
  onPartCodeChange: (value: string) => void
  onReset: () => void
  onNewOrder: () => void
  onToggleShortageList?: () => void
  showShortageList?: boolean
  canEdit: boolean
  isSearching?: boolean
  partCodeInputRef?: React.RefObject<HTMLInputElement | null>
}

export default function SearchFilters({
  statusFilter,
  partCodeFilter,
  onStatusChange,
  onPartCodeChange,
  onReset,
  onNewOrder,
  onToggleShortageList,
  showShortageList,
  canEdit,
  isSearching = false,
  partCodeInputRef
}: SearchFiltersProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
      <div className="px-6 py-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* アクションボタン */}
          <div className="flex gap-3">
            {canEdit && (
              <Button
                onClick={onNewOrder}
                className="bg-blue-600 hover:bg-blue-700"
              >
                📝 新規発注
              </Button>
            )}
            {onToggleShortageList && (
              <Button
                onClick={onToggleShortageList}
                variant={showShortageList ? "danger" : "outline"}
                className={showShortageList ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {showShortageList ? "📋 不足部品を非表示" : "⚠️ 不足部品一覧"}
              </Button>
            )}
            {isSearching && (
              <div className="flex items-center text-blue-600">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                <span className="text-sm">検索中...</span>
              </div>
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
              <input
                ref={partCodeInputRef}
                type="text"
                value={partCodeFilter}
                onChange={(e) => onPartCodeChange(e.target.value)}
                placeholder="部品コードで検索"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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