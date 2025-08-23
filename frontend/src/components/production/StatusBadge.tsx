import { StatusBadgeProps } from '@/types/production'

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyle = (status: string) => {
    switch (status) {
      case '計画':
        return 'bg-blue-100 text-blue-800'
      case '生産中':
        return 'bg-yellow-100 text-yellow-800'
      case '完了':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case '計画':
        return '📋'
      case '生産中':
        return '🔄'
      case '完了':
        return '✅'
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