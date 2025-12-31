import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { JwtListenerRule } from './jwt-auth-construct';

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

    // テナント別バックエンドLambda関数
    const tenantALambda = new lambda.Function(this, 'TenantALambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const headers = event.headers || {};
          const jwtPayload = headers['x-amzn-oidc-data'] ? 
            JSON.parse(Buffer.from(headers['x-amzn-oidc-data'], 'base64').toString()) : {};
          
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Tenant A API Response',
              tenantId: 'tenant-a',
              timestamp: new Date().toISOString(),
              user: jwtPayload.sub || 'unknown',
              scopes: jwtPayload.scope ? jwtPayload.scope.split(' ') : []
            })
          };
        };
      `),
    });

    const tenantBLambda = new lambda.Function(this, 'TenantBLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const headers = event.headers || {};
          const jwtPayload = headers['x-amzn-oidc-data'] ? 
            JSON.parse(Buffer.from(headers['x-amzn-oidc-data'], 'base64').toString()) : {};
          
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Tenant B API Response',
              tenantId: 'tenant-b',
              timestamp: new Date().toISOString(),
              user: jwtPayload.sub || 'unknown',
              scopes: jwtPayload.scope ? jwtPayload.scope.split(' ') : []
            })
          };
        };
      `),
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
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: JSON.stringify({
          error: 'Not Found',
          message: 'Invalid tenant path',
        }),
      }),
    });

    // JWT検証設定
    const jwksUri = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}/.well-known/jwks.json`;
    const issuer = `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`;

    // CfnListenerでJWT検証を設定
    const cfnListener = httpsListener.node.defaultChild as elbv2.CfnListener;
    
    // テナントA用ルール（/tenant-a/*）
    const tenantATargetGroup = new elbv2.ApplicationTargetGroup(this, 'TenantATargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.LAMBDA,
      targets: [new elbv2targets.LambdaTarget(tenantALambda)],
    });

    new JwtListenerRule(this, 'TenantAJwtRule', {
      listener: httpsListener,
      priority: 100,
      pathPatterns: ['/tenant-a/*'],
      jwtConfig: {
        issuer: issuer,
        jwksUri: jwksUri,
        clientId: tenantAClient.userPoolClientId,
      },
      targetGroup: tenantATargetGroup,
    });

    // テナントB用ルール（/tenant-b/*）
    const tenantBTargetGroup = new elbv2.ApplicationTargetGroup(this, 'TenantBTargetGroup', {
      vpc,
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.LAMBDA,
      targets: [new elbv2targets.LambdaTarget(tenantBLambda)],
    });

    new JwtListenerRule(this, 'TenantBJwtRule', {
      listener: httpsListener,
      priority: 200,
      pathPatterns: ['/tenant-b/*'],
      jwtConfig: {
        issuer: issuer,
        jwksUri: jwksUri,
        clientId: tenantBClient.userPoolClientId,
      },
      targetGroup: tenantBTargetGroup,
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
