import { StatusBadgeProps } from '@/types/procurement'

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case '納期回答待ち':
        return 'bg-yellow-100 text-yellow-800'
      case '入荷予定':
        return 'bg-blue-100 text-blue-800'
      case '入荷済み':
        return 'bg-green-100 text-green-800'
      case 'キャンセル':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case '納期回答待ち':
        return '⏳'
      case '入荷予定':
        return '📦'
      case '入荷済み':
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