# ==========================================
# BOM管理API 簡易テスト（jq不要版）
# Windows環境対応
# ==========================================

echo "🔧 BOM管理API 簡易テスト開始..."
echo "サーバー: http://localhost:3000"
echo ""

# ==========================================
# 1. 基本接続テスト
# ==========================================
echo "1️⃣ 基本接続テスト"
curl -X GET "http://localhost:3000/api/health"
echo ""
echo ""

# ==========================================
# 2. 製品一覧取得
# ==========================================
echo "2️⃣ 製品一覧取得"
curl -X GET "http://localhost:3000/api/bom/products"
echo ""
echo ""

# ==========================================
# 3. 新規製品作成
# ==========================================
echo "3️⃣ 新規製品作成"
curl -X POST "http://localhost:3000/api/bom/products" \
  -H "Content-Type: application/json" \
  -d "{\"product_code\": \"TEST-$(date +%s)\", \"standard_days\": 5, \"remarks\": \"テスト用製品\"}"
echo ""
echo ""

# ==========================================
# 4. 工程一覧取得
# ==========================================
echo "4️⃣ 全工程一覧取得"
curl -X GET "http://localhost:3000/api/bom/stations"
echo ""
echo ""

# ==========================================
# 5. 特定製品の工程一覧
# ==========================================
echo "5️⃣ V5000の工程一覧取得"
curl -X GET "http://localhost:3000/api/bom/products/V5000/stations"
echo ""
echo ""

# ==========================================
# 6. 使用部品一覧取得
# ==========================================
echo "6️⃣ V5000-sub1-1の使用部品一覧"
curl -X GET "http://localhost:3000/api/bom/products/V5000/stations/sub1-1/parts"
echo ""
echo ""

# ==========================================
# 7. BOM項目追加
# ==========================================
echo "7️⃣ BOM項目追加テスト"
curl -X POST "http://localhost:3000/api/bom/items" \
  -H "Content-Type: application/json" \
  -d '{
    "product_code": "V5000",
    "station_code": "sub1-2",
    "part_code": "SUS304-M6-20-HEX",
    "quantity": 3,
    "remarks": "APIテスト追加"
  }'
echo ""
echo ""

# ==========================================
# 8. エラーテスト
# ==========================================
echo "8️⃣ エラーテスト（重複BOM項目）"
curl -X POST "http://localhost:3000/api/bom/items" \
  -H "Content-Type: application/json" \
  -d '{
    "product_code": "V5000",
    "station_code": "sub1-1",
    "part_code": "LED-RED-5MM-20MA",
    "quantity": 2,
    "remarks": "重複テスト"
  }'
echo ""
echo ""

echo "✅ 簡易テスト完了"
echo "📊 結果確認ポイント："
echo "   - success: true が返ってくれば正常"
echo "   - エラー時は success: false + エラーメッセージ"
echo "   - HTTP ステータスコードも確認"