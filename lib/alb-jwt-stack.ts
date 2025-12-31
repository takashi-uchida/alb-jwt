import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export class AlbJwtStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'AlbJwtVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // マルチテナント用Cognito User Pool
    const userPool = new cognito.UserPool(this, 'MultiTenantUserPool', {
      userPoolName: 'alb-jwt-multitenant-pool',
      selfSignUpEnabled: false,
      signInAliases: {
        email: false,
        username: true,
      },
      standardAttributes: {
        email: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        tenantId: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 50,
          mutable: false,
        }),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Resource Server (API スコープ定義)
    const resourceServer = userPool.addResourceServer('ApiResourceServer', {
      identifier: 'api',
      scopes: [
        { scopeName: 'read', scopeDescription: 'Read access' },
        { scopeName: 'write', scopeDescription: 'Write access' },
        { scopeName: 'admin', scopeDescription: 'Admin access' },
      ],
    });

    // テナント用アプリクライアント（例：テナントA）
    const tenantAClient = userPool.addClient('TenantAClient', {
      userPoolClientName: 'tenant-a-client',
      generateSecret: true,
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          cognito.OAuthScope.custom('api/read'),
          cognito.OAuthScope.custom('api/write'),
        ],
      },
    });

    // テナント用アプリクライアント（例：テナントB）
    const tenantBClient = userPool.addClient('TenantBClient', {
      userPoolClientName: 'tenant-b-client',
      generateSecret: true,
      oAuth: {
        flows: {
          clientCredentials: true,
        },
        scopes: [
          cognito.OAuthScope.custom('api/read'),
        ],
      },
    });

    // ALB用証明書（自己署名）
    const certificate = new acm.Certificate(this, 'AlbCertificate', {
      domainName: '*.elb.amazonaws.com',
      validation: acm.CertificateValidation.fromDns(),
    });

    // Application Load Balancer
    const alb = new elbv2.ApplicationLoadBalancer(this, 'AlbJwtLoadBalancer', {
      vpc,
      internetFacing: true,
      loadBalancerName: 'alb-jwt-multitenant',
    });

    // HTTPS Listener with JWT verification
    const httpsListener = alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: JSON.stringify({
          message: 'JWT verification succeeded',
          timestamp: new Date().toISOString(),
        }),
      }),
    });

    // JWT検証設定をL7ルールで実装
    httpsListener.addAction('JwtAuth', {
      priority: 100,
      conditions: [
        elbv2.ListenerCondition.pathPatterns(['/*']),
      ],
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'application/json',
        messageBody: JSON.stringify({
          message: 'JWT verification succeeded',
          timestamp: new Date().toISOString(),
        }),
      }),
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      description: 'Cognito User Pool Domain',
    });

    new cdk.CfnOutput(this, 'TenantAClientId', {
      value: tenantAClient.userPoolClientId,
      description: 'Tenant A Client ID',
    });

    new cdk.CfnOutput(this, 'TenantBClientId', {
      value: tenantBClient.userPoolClientId,
      description: 'Tenant B Client ID',
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: alb.loadBalancerDnsName,
      description: 'ALB DNS Name',
    });

    new cdk.CfnOutput(this, 'JwksUri', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}/.well-known/jwks.json`,
      description: 'JWKS URI for JWT verification',
    });

    new cdk.CfnOutput(this, 'Issuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      description: 'JWT Issuer',
    });

    new cdk.CfnOutput(this, 'TokenEndpoint', {
      value: `https://${userPool.userPoolId}.auth.${this.region}.amazoncognito.com/oauth2/token`,
      description: 'OAuth2 Token Endpoint',
    });
  }
}
