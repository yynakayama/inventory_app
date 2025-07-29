/** @type {import('next').NextConfig} */
const nextConfig = {
  // React Strict Mode - 開発時のバグ検出強化
  reactStrictMode: true,

  // 実験的機能の有効化（Next.js 15対応）
  experimental: {
    // Turbopack使用（高速バンドル）
    turbo: {
      rules: {
        '*.svg': {
          loaders: ['@svgr/webpack'],
          as: '*.js',
        },
      },
    },
  },

  // 画像最適化設定
  images: {
    // 外部画像ドメインの許可（必要に応じて追加）
    domains: [],
    // 画像フォーマット最適化
    formats: ['image/webp', 'image/avif'],
  },

  // API設定
  async rewrites() {
    return [
      {
        // フロントエンドからバックエンドAPIへのプロキシ
        source: '/api/:path*',
        destination: 'http://inventory-app:3000/api/:path*',
      },
    ];
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // 環境変数の設定
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },

  // ビルド出力設定
  output: 'standalone',

  // TypeScript設定
  typescript: {
    // 型エラーでもビルドを継続（開発時のみ推奨）
    ignoreBuildErrors: false,
  },

  // ESLint設定
  eslint: {
    // ESLintエラーでもビルドを継続（開発時のみ推奨）
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;