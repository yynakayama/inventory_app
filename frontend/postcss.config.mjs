/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind CSS - ユーティリティクラスの処理
    tailwindcss: {},
    
    // Autoprefixer - ブラウザ互換性のためのプレフィックス自動追加
    autoprefixer: {},
  },
};

export default config;