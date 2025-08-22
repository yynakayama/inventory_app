/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // API設定（バックエンド接続用）
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://inventory-app:3000/api/:path*',
      },
    ];
  },

  // ビルド出力設定
  output: 'standalone',
};

export default nextConfig;