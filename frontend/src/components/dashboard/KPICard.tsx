interface KPICardProps {
  title: string
  value: number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  color?: 'blue' | 'green' | 'yellow' | 'red'
  icon?: string
  onClick?: () => void
}

export default function KPICard({ 
  title, 
  value, 
  unit = '', 
  trend = 'neutral', 
  color = 'blue', 
  icon, 
  onClick 
}: KPICardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100',
    green: 'bg-green-50 border-green-200 text-green-900 hover:bg-green-100',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900 hover:bg-yellow-100',
    red: 'bg-red-50 border-red-200 text-red-900 hover:bg-red-100'
  }

  const trendIcons = {
    up: '📈',
    down: '📉',
    neutral: '➡️'
  }

  const CardWrapper = onClick ? 'button' : 'div'

  return (
    <CardWrapper 
      className={`rounded-lg border-2 p-6 transition-colors duration-200 ${colorClasses[color]} ${
        onClick ? 'cursor-pointer text-left w-full' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {icon && <span className="text-lg">{icon}</span>}
            <p className="text-sm font-medium opacity-70">{title}</p>
          </div>
          <p className="text-2xl font-bold">
            {value.toLocaleString()}{unit}
          </p>
        </div>
        <div className="text-xl opacity-50">
          {trendIcons[trend]}
        </div>
      </div>
    </CardWrapper>
  )
}