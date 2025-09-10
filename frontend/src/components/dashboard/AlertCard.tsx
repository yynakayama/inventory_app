interface AlertCardProps {
  title: string
  count: number
  color: 'red' | 'yellow' | 'blue'
  icon: string
  onClick?: () => void
}

export default function AlertCard({ title, count, color, icon, onClick }: AlertCardProps) {
  if (count === 0) return null

  const colorClasses = {
    red: 'bg-red-50 border-red-200 text-red-800',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800'
  }

  return (
    <div 
      className={`p-4 rounded-lg border-2 ${colorClasses[color]} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm opacity-75">{count}件</p>
        </div>
      </div>
    </div>
  )
}