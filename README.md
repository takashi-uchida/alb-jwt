# マルチテナントSaaS ALB JWT認証

## アーキテクチャ

このプロジェクトは、Application Load Balancer (ALB) のJWT検証機能を使用したマルチテナントSaaSの認証システムを実装します。

### 主要コンポーネント

1. **Amazon Cognito User Pool**: マルチテナント対応の認証基盤
2. **Application Load Balancer**: JWT検証とルーティング
3. **テナント別アプリクライアント**: テナントごとの認証設定

### テナント分離戦略

- 共有Cognito User Poolを使用
- カスタム属性 `tenantId` でテナント識別
- テナント別のアプリクライアントで権限制御
- JWTクレームでテナント情報を伝達

## デプロイ

```bash
# 依存関係のインストール
npm install

# CDKのブートストラップ（初回のみ）
npx cdk bootstrap

# デプロイ
npm run deploy
```

## 使用方法

### 1. トークン取得

```bash
# テナントAのトークン取得
curl -X POST https://<USER_POOL_ID>.auth.<REGION>.amazoncognito.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=<TENANT_A_CLIENT_ID>&client_secret=<CLIENT_SECRET>&scope=api/read api/write"
```

### 2. API呼び出し

```bash
# JWT付きでALBにリクエスト
curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
     https://<ALB_DNS_NAME>
```

## 設定

デプロイ後、以下の情報が出力されます：

- `UserPoolId`: Cognito User Pool ID
- `TenantAClientId`: テナントA用クライアントID
- `TenantBClientId`: テナントB用クライアントID
- `AlbDnsName`: ALBのDNS名
- `TokenEndpoint`: OAuth2トークンエンドポイント
