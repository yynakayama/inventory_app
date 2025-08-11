'use client'

import { useState, useEffect } from 'react'
import RouteGuard from '@/components/guards/RouteGuard'

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
      normal?: number  // API修正後に追加される
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
}

function KPICard({ title, value, unit = '', trend = 'neutral', color = 'blue' }: KPICardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    red: 'bg-red-50 border-red-200 text-red-900'
  }

  const trendIcons = {
    up: '↗️',
    down: '↘️',
    neutral: '→'
  }

  return (
    <div className={`rounded-lg border-2 p-6 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium opacity-70">{title}</p>
          <p className="text-2xl font-bold">
            {value.toLocaleString()}{unit}
          </p>
        </div>
        <div className="text-2xl opacity-50">
          {trendIcons[trend]}
        </div>
      </div>
    </div>
  )
}

// メインダッシュボードコンテンツ
function DashboardContent() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // APIからダッシュボードデータを取得
  useEffect(() => {
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
          throw new Error(`ダッシュボードデータの取得に失敗しました: ${response.status}`)
        }

        const result = await response.json()
        
        if (result.success) {
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

    fetchDashboardData()
  }, [])

  // ローディング状態
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              <div className="h-4 bg-gray-200 rounded w-4/6"></div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // エラー状態
  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        </div>
        
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            データ取得エラー
          </h2>
          <p className="text-red-700">{error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            再読み込み
          </button>
        </div>
      </div>
    )
  }

  // データ表示
  if (!data) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-gray-500">データがありません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">ダッシュボード</h1>
        <div className="text-sm text-gray-500">
          最終更新: {new Date().toLocaleString('ja-JP')}
        </div>
      </div>

      {/* KPI概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* 不足部品 */}
        <KPICard
          title="不足部品総数"
          value={data.summary.shortage_parts.total}
          unit="件"
          color="red"
          trend={data.summary.shortage_parts.total > 0 ? 'up' : 'neutral'}
        />
        
        {/* 予定入荷 */}
        <KPICard
          title="予定入荷"
          value={data.summary.scheduled_receipts.total}
          unit="件"
          color="blue"
          trend="neutral"
        />
        
        {/* 仕入先総数 */}
        <KPICard
          title="仕入先総数"
          value={data.summary.suppliers.total}
          unit="社"
          color="green"
          trend="neutral"
        />
        
        {/* 棚おろし記録 */}
        <KPICard
          title="棚おろし記録"
          value={data.summary.stocktaking.total_records}
          unit="件"
          color="yellow"
          trend="neutral"
        />
      </div>

      {/* 詳細情報セクション */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 不足部品詳細 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">不足部品状況</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">緊急対応必要</span>
              <span className="font-semibold text-red-600">
                {data.summary.shortage_parts.emergency}件
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">警告レベル</span>
              <span className="font-semibold text-yellow-600">
                {data.summary.shortage_parts.warning}件
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">不足コスト合計</span>
              <span className="font-semibold text-gray-900">
                ¥{data.summary.shortage_parts.total_cost.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 予定入荷詳細 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">予定入荷状況</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">納期回答待ち</span>
              <span className="font-semibold text-yellow-600">
                {data.summary.scheduled_receipts.pending_response}件
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">遅延入荷</span>
              <span className="font-semibold text-red-600">
                {data.summary.scheduled_receipts.delayed}件
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">緊急入荷</span>
              <span className="font-semibold text-orange-600">
                {data.summary.scheduled_receipts.urgent}件
              </span>
            </div>
          </div>
        </div>

        {/* 仕入先詳細 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">仕入先状況</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">不足部品あり</span>
              <span className="font-semibold text-red-600">
                {data.summary.suppliers.with_shortages}社
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">遅延あり</span>
              <span className="font-semibold text-yellow-600">
                {data.summary.suppliers.with_delays}社
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">正常稼働</span>
              <span className="font-semibold text-green-600">
                {data.summary.suppliers.normal || Math.max(0, data.summary.suppliers.total - 
                 Math.max(data.summary.suppliers.with_shortages, data.summary.suppliers.with_delays))}社
              </span>
            </div>
          </div>
        </div>

        {/* 棚おろし詳細 */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">棚おろし状況</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">差異記録</span>
              <span className="font-semibold text-yellow-600">
                {data.summary.stocktaking.difference_records}件
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">平均差異</span>
              <span className="font-semibold text-gray-900">
                {data.summary.stocktaking.avg_difference.toFixed(2)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">最新実施日</span>
              <span className="font-semibold text-gray-900">
                {data.summary.stocktaking.latest_date || '未実施'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* クイックアクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">クイックアクション</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50">
            <div className="font-medium text-gray-900">在庫確認</div>
            <div className="text-sm text-gray-500">現在の在庫状況を確認</div>
          </button>
          <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50">
            <div className="font-medium text-gray-900">入荷処理</div>
            <div className="text-sm text-gray-500">新しい入荷を登録</div>
          </button>
          <button className="p-4 text-left border border-gray-200 rounded-lg hover:bg-gray-50">
            <div className="font-medium text-gray-900">レポート出力</div>
            <div className="text-sm text-gray-500">各種レポートを生成</div>
          </button>
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