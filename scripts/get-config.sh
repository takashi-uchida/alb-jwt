#!/bin/bash

# CDKデプロイ後の設定値を自動取得するスクリプト

echo "=== CDK出力値を取得中 ==="

# CDK出力値を取得
OUTPUTS=$(aws cloudformation describe-stacks \
    --stack-name AlbJwtStack \
    --query 'Stacks[0].Outputs' \
    --output json 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "エラー: CloudFormationスタックが見つかりません"
    echo "先にCDKをデプロイしてください: npm run deploy"
    exit 1
fi

# 各値を抽出
USER_POOL_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="UserPoolId") | .OutputValue')
TENANT_A_CLIENT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="TenantAClientId") | .OutputValue')
TENANT_B_CLIENT_ID=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="TenantBClientId") | .OutputValue')
ALB_DNS_NAME=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="AlbDnsName") | .OutputValue')
TOKEN_ENDPOINT=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="TokenEndpoint") | .OutputValue')

echo "User Pool ID: $USER_POOL_ID"
echo "Tenant A Client ID: $TENANT_A_CLIENT_ID"
echo "Tenant B Client ID: $TENANT_B_CLIENT_ID"
echo "ALB DNS Name: $ALB_DNS_NAME"
echo "Token Endpoint: $TOKEN_ENDPOINT"
echo ""

# クライアントシークレットを取得（要手動設定）
echo "=== 次のステップ ==="
echo "1. Cognitoコンソールでクライアントシークレットを確認"
echo "2. scripts/test-jwt.sh の設定値を更新"
echo "3. テスト実行: ./scripts/test-jwt.sh tenant-a /tenant-a/api/test"
echo ""
echo "Cognitoコンソール URL:"
echo "https://console.aws.amazon.com/cognito/v2/idp/user-pools/${USER_POOL_ID}/app-integration/clients"
