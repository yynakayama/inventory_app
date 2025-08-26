'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'

// ダッシュボードデータの型定義
interface DashboardData {
  summary: {
    shortage_parts: {
      total: number
      emergency: number
      warning: number
      total_cost: number
    }
    scheduled_receipts: {
      total: number
      pending_response: number
      delayed: number
      urgent: number
    }
    suppliers: {
      total: number
      with_shortages: number
      with_delays: number
      normal?: number
    }
    stocktaking: {
      total_records: number
      difference_records: number
      avg_difference: number
      latest_date: string | null
    }
  }
}

// KPIカードコンポーネント
interface KPICardProps {
  title: string
  value: number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  color?: 'blue' | 'green' | 'yellow' | 'red'
  icon?: string
  onClick?: () => void
}

function KPICard({ title, value, unit = '', trend = 'neutral', color = 'blue', icon, onClick }: KPICardProps) {
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

// アラートカードコンポーネント
interface AlertCardProps {
  title: string
  count: number
  color: 'red' | 'yellow' | 'blue'
  icon: string
  onClick?: () => void
}

function AlertCard({ title, count, color, icon, onClick }: AlertCardProps) {
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

// メインダッシュボードコンテンツ
function DashboardContent() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // APIからダッシュボードデータを取得
  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('認証トークンが見つかりません')
      }

      const response = await fetch('http://localhost:3000/api/reports/dashboard', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          // 認証エラーの場合はログイン画面にリダイレクト
          localStorage.removeItem('token')
          router.push('/login')
          return
        }
        throw new Error(`ダッシュボードデータの取得に失敗しました (${response.status})`)
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error(result.message || 'データ取得に失敗しました')
      }

    } catch (err) {
      console.error('ダッシュボードデータ取得エラー:', err)
      setError(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [])

  // ナビゲーション関数
  const navigateToInventoryList = () => router.push('/inventory')
  const navigateToProcurement = () => router.push('/procurement')
  const navigateToReports = () => router.push('/reports')

  // ローディング状態
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">📊 ダッシュボード</h1>
            </div>
            
            {/* ローディングスケルトン */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg border-2 p-6 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                  <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                  <div className="space-y-3">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                    <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // エラー状態
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">📊 ダッシュボード</h1>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">⚠️</span>
                <h2 className="text-lg font-semibold text-red-800">
                  データ取得エラー
                </h2>
              </div>
              <p className="text-red-700 mb-4">{error}</p>
              <div className="flex gap-3">
                <Button onClick={fetchDashboardData} className="bg-red-600 hover:bg-red-700">
                  再読み込み
                </Button>
                <Button variant="secondary" onClick={() => router.push('/login')}>
                  ログイン画面へ
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // データ表示
  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-gray-900">📊 ダッシュボード</h1>
            </div>
            
            <div className="bg-white rounded-lg shadow p-6 text-center">
              <p className="text-gray-500">データが利用できません</p>
              <Button onClick={fetchDashboardData} className="mt-4">
                再読み込み
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">📊 ダッシュボード</h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                最終更新: {new Date().toLocaleString('ja-JP')}
              </div>
              <Button onClick={fetchDashboardData} size="sm" variant="secondary">
                🔄 更新
              </Button>
            </div>
          </div>

          {/* 緊急アラート */}
          {(data.summary.shortage_parts.emergency > 0 || data.summary.scheduled_receipts.delayed > 0) && (
            <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
              <h2 className="text-lg font-semibold text-red-800 mb-4">🚨 緊急対応が必要な項目</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AlertCard
                  title="緊急不足部品"
                  count={data.summary.shortage_parts.emergency}
                  color="red"
                  icon="🔴"
                  onClick={navigateToInventoryList}
                />
                <AlertCard
                  title="遅延入荷"
                  count={data.summary.scheduled_receipts.delayed}
                  color="yellow"
                  icon="⏰"
                  onClick={navigateToProcurement}
                />
              </div>
            </div>
          )}

          {/* KPI概要カード */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <KPICard
              title="不足部品総数"
              value={data.summary.shortage_parts.total}
              unit="件"
              color="red"
              icon="📦"
              trend={data.summary.shortage_parts.total > 0 ? 'up' : 'neutral'}
              onClick={navigateToInventoryList}
            />
            
            <KPICard
              title="予定入荷"
              value={data.summary.scheduled_receipts.total}
              unit="件"
              color="blue"
              icon="🚚"
              trend="neutral"
              onClick={navigateToProcurement}
            />
            
            <KPICard
              title="仕入先総数"
              value={data.summary.suppliers.total}
              unit="社"
              color="green"
              icon="🏢"
              trend="neutral"
            />
            
            <KPICard
              title="棚おろし記録"
              value={data.summary.stocktaking.total_records}
              unit="件"
              color="yellow"
              icon="📋"
              trend="neutral"
              onClick={navigateToReports}
            />
          </div>

          {/* 詳細情報セクション */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 不足部品詳細 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">📦 不足部品状況</h2>
                <Button size="sm" variant="secondary" onClick={navigateToInventoryList}>
                  詳細表示
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">🔴 緊急対応必要</span>
                  <span className="font-bold text-red-600">
                    {data.summary.shortage_parts.emergency}件
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">⚠️ 警告レベル</span>
                  <span className="font-bold text-yellow-600">
                    {data.summary.shortage_parts.warning}件
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">💰 不足コスト合計</span>
                  <span className="font-bold text-gray-900">
                    ¥{data.summary.shortage_parts.total_cost.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 予定入荷詳細 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">🚚 予定入荷状況</h2>
                <Button size="sm" variant="secondary" onClick={navigateToProcurement}>
                  詳細表示
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">📋 納期回答待ち</span>
                  <span className="font-bold text-orange-600">
                    {data.summary.scheduled_receipts.pending_response}件
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">⏰ 遅延入荷</span>
                  <span className="font-bold text-red-600">
                    {data.summary.scheduled_receipts.delayed}件
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">🚨 緊急入荷</span>
                  <span className="font-bold text-yellow-600">
                    {data.summary.scheduled_receipts.urgent}件
                  </span>
                </div>
              </div>
            </div>

            {/* 仕入先詳細 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">🏢 仕入先状況</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">🔴 不足部品あり</span>
                  <span className="font-bold text-red-600">
                    {data.summary.suppliers.with_shortages}社
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">⏰ 遅延あり</span>
                  <span className="font-bold text-yellow-600">
                    {data.summary.suppliers.with_delays}社
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">✅ 正常稼働</span>
                  <span className="font-bold text-green-600">
                    {data.summary.suppliers.normal || Math.max(0, 
                      data.summary.suppliers.total - 
                      Math.max(data.summary.suppliers.with_shortages, data.summary.suppliers.with_delays)
                    )}社
                  </span>
                </div>
              </div>
            </div>

            {/* 棚おろし詳細 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">📋 棚おろし状況</h2>
                <Button size="sm" variant="secondary" onClick={navigateToReports}>
                  レポート表示
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">📊 差異記録</span>
                  <span className="font-bold text-yellow-600">
                    {data.summary.stocktaking.difference_records}件
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">📈 平均差異</span>
                  <span className="font-bold text-blue-600">
                    {data.summary.stocktaking.avg_difference.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">📅 最新実施日</span>
                  <span className="font-bold text-gray-700">
                    {data.summary.stocktaking.latest_date || '未実施'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* クイックアクション */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">⚡ クイックアクション</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <PermissionGuard requiredPermissions={['inventory.view']}>
                <button 
                  onClick={navigateToInventoryList}
                  className="p-4 text-left border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">📦</span>
                    <div className="font-medium text-gray-900">部材管理</div>
                  </div>
                  <div className="text-sm text-gray-500">在庫・履歴・数量調整</div>
                </button>
              </PermissionGuard>

              <PermissionGuard requiredPermissions={['procurement.view']}>
                <button 
                  onClick={navigateToProcurement}
                  className="p-4 text-left border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🚚</span>
                    <div className="font-medium text-gray-900">調達管理</div>
                  </div>
                  <div className="text-sm text-gray-500">発注・入荷処理を実行</div>
                </button>
              </PermissionGuard>

              <PermissionGuard requiredPermissions={['reports.view']}>
                <button 
                  onClick={navigateToReports}
                  className="p-4 text-left border border-gray-200 rounded-lg hover:bg-purple-50 hover:border-purple-300 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">📊</span>
                    <div className="font-medium text-gray-900">レポート</div>
                  </div>
                  <div className="text-sm text-gray-500">各種レポートを確認</div>
                </button>
              </PermissionGuard>

              <PermissionGuard requiredPermissions={['production.view']}>
                <button 
                  onClick={() => router.push('/production/plans')}
                  className="p-4 text-left border border-gray-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 transition-colors duration-200"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🏭</span>
                    <div className="font-medium text-gray-900">生産計画</div>
                  </div>
                  <div className="text-sm text-gray-500">生産計画を確認・作成</div>
                </button>
              </PermissionGuard>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// メインダッシュボードページ
export default function DashboardPage() {
  return (
    <RouteGuard>
      <DashboardContent />
    </RouteGuard>
  )
}