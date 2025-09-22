'use client'

import RouteGuard from '@/components/guards/RouteGuard'
import PermissionGuard from '@/components/guards/PermissionGuard'

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">📦 製品・BOM管理</h1>
              <p className="text-gray-600">製品マスターとBOM（部品表）を管理します</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
              <div className="text-center">
                <div className="text-6xl mb-4">🚧</div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">開発中</h2>
                <p className="text-gray-600">
                  製品・BOM管理機能は現在開発中です。<br />
                  完成次第、製品登録・BOM編集・工程管理機能をご利用いただけます。
                </p>
              </div>
            </div>
          </div>
        </div>
  )
}