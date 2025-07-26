#!/bin/bash

# 在庫管理システム - 簡単ログインスクリプト（修正版）
# 使用方法: ./login.sh [ユーザー名]

BASE_URL="http://localhost:3000"

declare -A USERS=(
    ["admin"]="admin123"
    ["production"]="prod123"
    ["material"]="material123"
    ["viewer"]="viewer123"
)

declare -A USER_FULL_NAMES=(
    ["admin"]="admin"
    ["production"]="production_mgr"
    ["material"]="material_staff"
    ["viewer"]="viewer_user"
)

if [ $# -eq 0 ]; then
    echo "🔐 在庫管理システム ログインスクリプト"
    echo ""
    echo "使用方法: ./login.sh [ユーザー名]"
    echo ""
    echo "利用可能なユーザー:"
    echo "  admin      - 管理者（全権限）"
    echo "  production - 生産管理者（生産計画・BOM管理）"
    echo "  material   - 資材担当者（在庫・調達管理）"
    echo "  viewer     - 閲覧者（参照のみ）"
    echo ""
    echo "例: ./login.sh admin"
    exit 1
fi

USER_TYPE=$1

if [[ ! ${USERS[$USER_TYPE]+_} ]]; then
    echo "❌ エラー: 不正なユーザー名です: $USER_TYPE"
    echo "利用可能: admin, production, material, viewer"
    exit 1
fi

USERNAME=${USER_FULL_NAMES[$USER_TYPE]}
PASSWORD=${USERS[$USER_TYPE]}

echo "🔄 ログイン中... ($USERNAME)"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\", \"password\":\"$PASSWORD\"}")

if [ $? -ne 0 ]; then
    echo "❌ ログインAPIへの接続に失敗しました"
    echo "サーバーが起動していることを確認してください: $BASE_URL"
    exit 1
fi

# 新しいレスポンス構造に対応
TOKEN=$(echo "$RESPONSE" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":[^,}]*' | cut -d':' -f2)

if [ "$SUCCESS" = "true" ] && [ -n "$TOKEN" ]; then
    echo "✅ ログイン成功!"
    echo ""
    echo "ユーザー: $USERNAME ($USER_TYPE)"
    echo "権限:"
    case $USER_TYPE in
        "admin")
            echo "  - 全機能アクセス可能"
            ;;
        "production")
            echo "  - 生産計画管理"
            echo "  - BOM管理"
            echo "  - 全データ参照"
            ;;
        "material")
            echo "  - 在庫管理"
            echo "  - 調達管理"
            echo "  - 全データ参照"
            ;;
        "viewer")
            echo "  - 全データ参照のみ"
            ;;
    esac
    echo ""
    echo "🔑 アクセストークン:"
    echo "$TOKEN"
    echo ""
    echo "📝 環境変数に設定:"
    echo "export TOKEN=\"$TOKEN\""
    echo ""
    echo "🧪 テスト用コマンド例:"
    echo "# 在庫一覧取得（全ユーザー可）"
    echo "curl -H \"Authorization: Bearer \$TOKEN\" $BASE_URL/api/inventory"
    echo ""
    if [ "$USER_TYPE" != "viewer" ]; then
        echo "# 在庫更新（資材担当者権限必要）"
        echo "curl -X PUT $BASE_URL/api/inventory/SUS304-M6-25-HEX \\"
        echo "  -H \"Authorization: Bearer \$TOKEN\" \\"
        echo "  -H \"Content-Type: application/json\" \\"
        echo "  -d '{\"current_stock\": 100, \"reason\": \"テスト更新\"}'"
    fi
    
    export TOKEN="$TOKEN"
    echo ""
    echo "✨ TOKEN環境変数が自動設定されました"
    
else
    echo "❌ ログイン失敗"
    echo "サーバーレスポンス: $RESPONSE"
    exit 1
fi
