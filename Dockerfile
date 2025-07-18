# Node.js 22.15.1の公式イメージを使用
FROM node:22.15.1-slim

# 必要なパッケージをインストール（mysql-client, netcat追加）
RUN apt-get update && apt-get install -y \
    default-mysql-client \
    netcat-openbsd \
    && apt-get upgrade -y \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm install

# アプリケーションのソースコードをコピー
COPY . .

# アプリケーションが使用するポートを指定
EXPOSE 3000

# 開発時はnodemonでホットリロードを有効にする
CMD ["npm", "run", "dev"]