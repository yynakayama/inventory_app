import { Metadata } from 'next';

// メタデータ設定 - このページ専用
export const metadata: Metadata = {
  title: 'ダッシュボード',
  description: '在庫状況の概要と重要な指標を確認',
};

// トップページコンポーネント（ダッシュボード）
export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* ページタイトル */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900">ダッシュボード</h2>
        <p className="mt-2 text-gray-600">
          在庫状況の概要と重要な指標を確認できます
        </p>
      </div>

      {/* サマリーカード群 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* 総在庫点数 */}
        <div className="card-base">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">📦</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">総在庫点数</p>
              <p className="text-2xl font-bold text-gray-900">1,234</p>
            </div>
          </div>
        </div>

        {/* 在庫不足アイテム */}
        <div className="card-base">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">⚠️</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">在庫不足</p>
              <p className="text-2xl font-bold text-yellow-600">23</p>
            </div>
          </div>
        </div>

        {/* 今日の入荷予定 */}
        <div className="card-base">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">📥</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">今日の入荷予定</p>
              <p className="text-2xl font-bold text-green-600">8</p>
            </div>
          </div>
        </div>

        {/* 予約済み在庫 */}
        <div className="card-base">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">🔒</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">予約済み在庫</p>
              <p className="text-2xl font-bold text-purple-600">156</p>
            </div>
          </div>
        </div>
      </div>

      {/* 機能メニュー */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {/* 在庫管理 */}
        <div className="card-base hover:shadow-md transition-shadow cursor-pointer">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📋</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              在庫管理
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              在庫の確認・更新・入出荷処理
            </p>
            <button className="btn-primary w-full">
              在庫管理へ
            </button>
          </div>
        </div>

        {/* 生産計画 */}
        <div className="card-base hover:shadow-md transition-shadow cursor-pointer">
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📊</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              生産計画
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              生産計画の作成・BOM管理
            </p>
            <button className="btn-success w-full">
              生産計画へ
            </button>
          </div>
        </div>

        {/* レポート */}
        <div className="card-base hover:shadow-md transition-shadow cursor-pointer">
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📈</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              レポート
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              在庫分析・履歴・統計情報
            </p>
            <button className="btn-warning w-full">
              レポートへ
            </button>
          </div>
        </div>
      </div>

      {/* 最近の活動 */}
      <div className="card-base">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          最近の活動
        </h3>
        <div className="space-y-3">
          {/* アクティビティアイテム1 */}
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm text-gray-900">
                部品A001の入荷処理が完了しました（数量: 100）
              </p>
              <p className="text-xs text-gray-500">2025年7月30日 10:30</p>
            </div>
          </div>

          {/* アクティビティアイテム2 */}
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm text-gray-900">
                部品B002の在庫が安全在庫を下回りました
              </p>
              <p className="text-xs text-gray-500">2025年7月30日 09:15</p>
            </div>
          </div>

          {/* アクティビティアイテム3 */}
          <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="flex-1">
              <p className="text-sm text-gray-900">
                新しい生産計画P2025-007が作成されました（在庫予約完了）
              </p>
              <p className="text-xs text-gray-500">2025年7月30日 08:45</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}