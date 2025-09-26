'use client'

import { useState, useEffect } from 'react'
import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'
import Button from '@/components/ui/Button'

interface Station {
  station_code: string
  process_group: string
  remarks: string | null
}

export default function StationsPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Modal state
  const [showStationModal, setShowStationModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  // Form state
  const [stationForm, setStationForm] = useState({
    station_code: '',
    process_group: '',
    remarks: ''
  })

  // Fetch all stations
  const fetchStations = async () => {
    try {
      setLoading(true)
      setError(null)

      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:3000/api/bom/stations', {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      if (!response.ok) throw new Error('工程一覧の取得に失敗しました')

      const result = await response.json()
      if (result.success) {
        setStations(result.data)
      } else {
        throw new Error(result.message)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '工程一覧の取得エラー')
    } finally {
      setLoading(false)
    }
  }

  // Handle opening the modal for new station creation
  const handleNewStation = () => {
    // TODO: バックエンドに工程作成API(POST /api/bom/stations)が実装されたら、この機能を有効化する
    alert('工程の新規作成機能は現在利用できません。')
    // setIsEditing(false)
    // setStationForm({ station_code: '', process_group: '', remarks: '' })
    // setShowStationModal(true)
  }

  // Handle opening the modal for editing a station
  const handleEditStation = (station: Station) => {
    // TODO: バックエンドに工程更新API(PUT /api/bom/stations/:station_code)が実装されたら、この機能を有効化する
    alert('工程の編集機能は現在利用できません。')
    // setIsEditing(true)
    // setStationForm({ ...station, remarks: station.remarks || '' })
    // setShowStationModal(true)
  }

  // Handle station deletion
  const handleDeleteStation = async (stationCode: string) => {
    // TODO: バックエンドに工程削除API(DELETE /api/bom/stations/:station_code)が実装されたら、この機能を有効化する
    alert('工程の削除機能は現在利用できません。')
    // if (!confirm(`工程「${stationCode}」を本当に削除しますか？`)) return
    // ... API call logic here
  }

  // Handle form submission (Create or Update)
  const handleSubmit = async () => {
    alert('APIが実装されていないため、この機能は利用できません。')
  }

  useEffect(() => {
    fetchStations()
  }, [])

  const filteredStations = stations.filter(station =>
    searchTerm === '' ||
    station.station_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    station.process_group.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (station.remarks && station.remarks.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  return (
    <RouteGuard>
      <PermissionGuard requiredRoles={['admin']}>
        <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">🏢 工程マスタ管理</h1>
            <p className="text-gray-600">工程の基本情報を管理します。</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-4">
              <input
                type="text"
                placeholder="コード・グループ・備考で検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full md:w-1/3 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2">
                <Button onClick={handleNewStation} disabled>➕ 新規工程</Button>
                <Button variant="secondary" onClick={fetchStations} isLoading={loading}>🔄 更新</Button>
              </div>
            </div>

            {error && <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">工程コード</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">工程グループ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">備考</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading && stations.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8">読み込み中...</td></tr>
                  ) : filteredStations.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-8">工程がありません。</td></tr>
                  ) : (
                    filteredStations.map(station => (
                      <tr key={station.station_code} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{station.station_code}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">{station.process_group}</td>
                        <td className="px-4 py-4 text-sm text-gray-500">{station.remarks || '-'}</td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleEditStation(station)} disabled>
                            編集
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => handleDeleteStation(station.station_code)} disabled>
                            削除
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Station Create/Edit Modal (Structure only) */}
        {showStationModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">{isEditing ? '工程編集' : '工程 新規作成'}</h3>
              <div className="space-y-4">
                 <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">工程コード（必須）</label>
                  <input type="text" value={stationForm.station_code} disabled={isEditing} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">工程グループ（必須）</label>
                  <input type="text" value={stationForm.process_group} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                  <textarea value={stationForm.remarks} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
                </div>
              </div>
              <div className="flex gap-2 mt-6 justify-end">
                <Button variant="secondary" onClick={() => setShowStationModal(false)}>キャンセル</Button>
                <Button onClick={handleSubmit} disabled> {isEditing ? '更新' : '作成'} </Button>
              </div>
            </div>
          </div>
        )}
      </PermissionGuard>
    </RouteGuard>
  )
}