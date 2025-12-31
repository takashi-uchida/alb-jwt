#!/bin/bash

# 設定値（デプロイ後に更新してください）
USER_POOL_ID=""
TENANT_A_CLIENT_ID=""
TENANT_A_CLIENT_SECRET=""
TENANT_B_CLIENT_ID=""
TENANT_B_CLIENT_SECRET=""
ALB_DNS_NAME=""
REGION="ap-northeast-1"

# 使用方法を表示
usage() {
    echo "使用方法: $0 [tenant-a|tenant-b] [endpoint]"
    echo "例: $0 tenant-a /tenant-a/api/users"
    echo ""
    echo "設定値を更新してください:"
    echo "  USER_POOL_ID: $USER_POOL_ID"
    echo "  ALB_DNS_NAME: $ALB_DNS_NAME"
    exit 1
}

# 引数チェック
if [ $# -ne 2 ]; then
    usage
fi

TENANT=$1
ENDPOINT=$2

# テナント別の設定
case $TENANT in
    "tenant-a")
        CLIENT_ID=$TENANT_A_CLIENT_ID
        CLIENT_SECRET=$TENANT_A_CLIENT_SECRET
        SCOPE="api/read api/write"
        ;;
    "tenant-b")
        CLIENT_ID=$TENANT_B_CLIENT_ID
        CLIENT_SECRET=$TENANT_B_CLIENT_SECRET
        SCOPE="api/read"
        ;;
    *)
        echo "エラー: 無効なテナント名: $TENANT"
        usage
        ;;
esac

# 設定値チェック
if [ -z "$USER_POOL_ID" ] || [ -z "$CLIENT_ID" ] || [ -z "$ALB_DNS_NAME" ]; then
    echo "エラー: 設定値が不足しています"
    usage
fi

echo "=== $TENANT のトークン取得 ==="

# アクセストークンを取得
TOKEN_RESPONSE=$(curl -s -X POST \
    "https://${USER_POOL_ID}.auth.${REGION}.amazoncognito.com/oauth2/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&scope=${SCOPE}")

echo "トークンレスポンス: $TOKEN_RESPONSE"

# アクセストークンを抽出
ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token // empty')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" = "null" ]; then
    echo "エラー: アクセストークンの取得に失敗しました"
    echo "レスポンス: $TOKEN_RESPONSE"
    exit 1
fi

echo "アクセストークン取得成功"
echo ""

echo "=== ALB API呼び出し ==="
echo "URL: https://${ALB_DNS_NAME}${ENDPOINT}"
echo ""

# ALBにリクエスト
curl -v -H "Authorization: Bearer ${ACCESS_TOKEN}" \
     "https://${ALB_DNS_NAME}${ENDPOINT}"

echo ""
echo ""
echo "=== JWT デコード ==="
echo "Header:"
echo $ACCESS_TOKEN | cut -d'.' -f1 | base64 -d 2>/dev/null | jq . || echo "デコードエラー"
echo ""
echo "Payload:"
echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq . || echo "デコードエラー"
