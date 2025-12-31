"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlbJwtStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const elbv2targets = require("aws-cdk-lib/aws-elasticloadbalancingv2-targets");
const ec2 = require("aws-cdk-lib/aws-ec2");
const lambda = require("aws-cdk-lib/aws-lambda");
const acm = require("aws-cdk-lib/aws-certificatemanager");
const jwt_auth_construct_1 = require("./jwt-auth-construct");
class AlbJwtStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        const cfnListener = httpsListener.node.defaultChild;
        // テナントA用ルール（/tenant-a/*）
        const tenantATargetGroup = new elbv2.ApplicationTargetGroup(this, 'TenantATargetGroup', {
            vpc,
            port: 80,
            protocol: elbv2.ApplicationProtocol.HTTP,
            targetType: elbv2.TargetType.LAMBDA,
            targets: [new elbv2targets.LambdaTarget(tenantALambda)],
        });
        new jwt_auth_construct_1.JwtListenerRule(this, 'TenantAJwtRule', {
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
        new jwt_auth_construct_1.JwtListenerRule(this, 'TenantBJwtRule', {
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
exports.AlbJwtStack = AlbJwtStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxiLWp3dC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFsYi1qd3Qtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLG1EQUFtRDtBQUNuRCxnRUFBZ0U7QUFDaEUsK0VBQStFO0FBQy9FLDJDQUEyQztBQUMzQyxpREFBaUQ7QUFDakQsMERBQTBEO0FBRTFELDZEQUF1RDtBQUV2RCxNQUFhLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUN4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU07UUFDTixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN6QyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDO1lBQ2QsbUJBQW1CLEVBQUU7Z0JBQ25CO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07aUJBQ2xDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNqRSxZQUFZLEVBQUUsMEJBQTBCO1lBQ3hDLGlCQUFpQixFQUFFLEtBQUs7WUFDeEIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxLQUFLO2dCQUNaLFFBQVEsRUFBRSxJQUFJO2FBQ2Y7WUFDRCxrQkFBa0IsRUFBRTtnQkFDbEIsS0FBSyxFQUFFO29CQUNMLFFBQVEsRUFBRSxLQUFLO29CQUNmLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2FBQ0Y7WUFDRCxnQkFBZ0IsRUFBRTtnQkFDaEIsUUFBUSxFQUFF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V0FBVyxFQUFFLHVCQUF1QjtTQUNyQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUF0UEQsa0NBc1BDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgZWxidjJ0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lbGFzdGljbG9hZGJhbGFuY2luZ3YyLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBKd3RMaXN0ZW5lclJ1bGUgfSBmcm9tICcuL2p3dC1hdXRoLWNvbnN0cnVjdCc7XG5cbmV4cG9ydCBjbGFzcyBBbGJKd3RTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFZQQ1xuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdBbGJKd3RWcGMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMCxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8g44Oe44Or44OB44OG44OK44Oz44OI55SoQ29nbml0byBVc2VyIFBvb2xcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdNdWx0aVRlbmFudFVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAnYWxiLWp3dC1tdWx0aXRlbmFudC1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IGZhbHNlLFxuICAgICAgICB1c2VybmFtZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIHRlbmFudElkOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDUwLFxuICAgICAgICAgIG11dGFibGU6IGZhbHNlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUmVzb3VyY2UgU2VydmVyIChBUEkg44K544Kz44O844OX5a6a576pKVxuICAgIGNvbnN0IHJlc291cmNlU2VydmVyID0gdXNlclBvb2wuYWRkUmVzb3VyY2VTZXJ2ZXIoJ0FwaVJlc291cmNlU2VydmVyJywge1xuICAgICAgaWRlbnRpZmllcjogJ2FwaScsXG4gICAgICBzY29wZXM6IFtcbiAgICAgICAgeyBzY29wZU5hbWU6ICdyZWFkJywgc2NvcGVEZXNjcmlwdGlvbjogJ1JlYWQgYWNjZXNzJyB9LFxuICAgICAgICB7IHNjb3BlTmFtZTogJ3dyaXRlJywgc2NvcGVEZXNjcmlwdGlvbjogJ1dyaXRlIGFjY2VzcycgfSxcbiAgICAgICAgeyBzY29wZU5hbWU6ICdhZG1pbicsIHNjb3BlRGVzY3JpcHRpb246ICdBZG1pbiBhY2Nlc3MnIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8g44OG44OK44Oz44OI55So44Ki44OX44Oq44Kv44Op44Kk44Ki44Oz44OI77yI5L6L77ya44OG44OK44Oz44OIQe+8iVxuICAgIGNvbnN0IHRlbmFudEFDbGllbnQgPSB1c2VyUG9vbC5hZGRDbGllbnQoJ1RlbmFudEFDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICd0ZW5hbnQtYS1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IHRydWUsXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGNsaWVudENyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuY3VzdG9tKCdhcGkvcmVhZCcpLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5jdXN0b20oJ2FwaS93cml0ZScpLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIOODhuODiuODs+ODiOeUqOOCouODl+ODquOCr+ODqeOCpOOCouODs+ODiO+8iOS+i++8muODhuODiuODs+ODiELvvIlcbiAgICBjb25zdCB0ZW5hbnRCQ2xpZW50ID0gdXNlclBvb2wuYWRkQ2xpZW50KCdUZW5hbnRCQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAndGVuYW50LWItY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiB0cnVlLFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBjbGllbnRDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLmN1c3RvbSgnYXBpL3JlYWQnKSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBTELnlKjoqLzmmI7mm7jvvIjoh6rlt7HnvbLlkI3vvIlcbiAgICBjb25zdCBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0FsYkNlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogJyouZWxiLmFtYXpvbmF3cy5jb20nLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKCksXG4gICAgfSk7XG5cbiAgICAvLyDjg4bjg4rjg7Pjg4jliKXjg5Djg4Pjgq/jgqjjg7Pjg4lMYW1iZGHplqLmlbBcbiAgICBjb25zdCB0ZW5hbnRBTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnVGVuYW50QUxhbWJkYScsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG4gICAgICAgIGV4cG9ydHMuaGFuZGxlciA9IGFzeW5jIChldmVudCkgPT4ge1xuICAgICAgICAgIGNvbnN0IGhlYWRlcnMgPSBldmVudC5oZWFkZXJzIHx8IHt9O1xuICAgICAgICAgIGNvbnN0IGp3dFBheWxvYWQgPSBoZWFkZXJzWyd4LWFtem4tb2lkYy1kYXRhJ10gPyBcbiAgICAgICAgICAgIEpTT04ucGFyc2UoQnVmZmVyLmZyb20oaGVhZGVyc1sneC1hbXpuLW9pZGMtZGF0YSddLCAnYmFzZTY0JykudG9TdHJpbmcoKSkgOiB7fTtcbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgICAgICAgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0sXG4gICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgICAgIG1lc3NhZ2U6ICdUZW5hbnQgQSBBUEkgUmVzcG9uc2UnLFxuICAgICAgICAgICAgICB0ZW5hbnRJZDogJ3RlbmFudC1hJyxcbiAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgIHVzZXI6IGp3dFBheWxvYWQuc3ViIHx8ICd1bmtub3duJyxcbiAgICAgICAgICAgICAgc2NvcGVzOiBqd3RQYXlsb2FkLnNjb3BlID8gand0UGF5bG9hZC5zY29wZS5zcGxpdCgnICcpIDogW11cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICAgIGApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgdGVuYW50QkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1RlbmFudEJMYW1iZGEnLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zdCBoZWFkZXJzID0gZXZlbnQuaGVhZGVycyB8fCB7fTtcbiAgICAgICAgICBjb25zdCBqd3RQYXlsb2FkID0gaGVhZGVyc1sneC1hbXpuLW9pZGMtZGF0YSddID8gXG4gICAgICAgICAgICBKU09OLnBhcnNlKEJ1ZmZlci5mcm9tKGhlYWRlcnNbJ3gtYW16bi1vaWRjLWRhdGEnXSwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCkpIDoge307XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBtZXNzYWdlOiAnVGVuYW50IEIgQVBJIFJlc3BvbnNlJyxcbiAgICAgICAgICAgICAgdGVuYW50SWQ6ICd0ZW5hbnQtYicsXG4gICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICB1c2VyOiBqd3RQYXlsb2FkLnN1YiB8fCAndW5rbm93bicsXG4gICAgICAgICAgICAgIHNjb3Blczogand0UGF5bG9hZC5zY29wZSA/IGp3dFBheWxvYWQuc2NvcGUuc3BsaXQoJyAnKSA6IFtdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgICBgKSxcbiAgICB9KTtcblxuICAgIC8vIEFwcGxpY2F0aW9uIExvYWQgQmFsYW5jZXJcbiAgICBjb25zdCBhbGIgPSBuZXcgZWxidjIuQXBwbGljYXRpb25Mb2FkQmFsYW5jZXIodGhpcywgJ0FsYkp3dExvYWRCYWxhbmNlcicsIHtcbiAgICAgIHZwYyxcbiAgICAgIGludGVybmV0RmFjaW5nOiB0cnVlLFxuICAgICAgbG9hZEJhbGFuY2VyTmFtZTogJ2FsYi1qd3QtbXVsdGl0ZW5hbnQnLFxuICAgIH0pO1xuXG4gICAgLy8gSFRUUFMgTGlzdGVuZXIgd2l0aCBKV1QgdmVyaWZpY2F0aW9uXG4gICAgY29uc3QgaHR0cHNMaXN0ZW5lciA9IGFsYi5hZGRMaXN0ZW5lcignSHR0cHNMaXN0ZW5lcicsIHtcbiAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgIHByb3RvY29sOiBlbGJ2Mi5BcHBsaWNhdGlvblByb3RvY29sLkhUVFBTLFxuICAgICAgY2VydGlmaWNhdGVzOiBbY2VydGlmaWNhdGVdLFxuICAgICAgZGVmYXVsdEFjdGlvbjogZWxidjIuTGlzdGVuZXJBY3Rpb24uZml4ZWRSZXNwb25zZSg0MDQsIHtcbiAgICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgbWVzc2FnZUJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ05vdCBGb3VuZCcsXG4gICAgICAgICAgbWVzc2FnZTogJ0ludmFsaWQgdGVuYW50IHBhdGgnLFxuICAgICAgICB9KSxcbiAgICAgIH0pLFxuICAgIH0pO1xuXG4gICAgLy8gSldU5qSc6Ki86Kit5a6aXG4gICAgY29uc3Qgandrc1VyaSA9IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfS8ud2VsbC1rbm93bi9qd2tzLmpzb25gO1xuICAgIGNvbnN0IGlzc3VlciA9IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfWA7XG5cbiAgICAvLyBDZm5MaXN0ZW5lcuOBp0pXVOaknOiovOOCkuioreWumlxuICAgIGNvbnN0IGNmbkxpc3RlbmVyID0gaHR0cHNMaXN0ZW5lci5ub2RlLmRlZmF1bHRDaGlsZCBhcyBlbGJ2Mi5DZm5MaXN0ZW5lcjtcbiAgICBcbiAgICAvLyDjg4bjg4rjg7Pjg4hB55So44Or44O844Or77yIL3RlbmFudC1hLyrvvIlcbiAgICBjb25zdCB0ZW5hbnRBVGFyZ2V0R3JvdXAgPSBuZXcgZWxidjIuQXBwbGljYXRpb25UYXJnZXRHcm91cCh0aGlzLCAnVGVuYW50QVRhcmdldEdyb3VwJywge1xuICAgICAgdnBjLFxuICAgICAgcG9ydDogODAsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQLFxuICAgICAgdGFyZ2V0VHlwZTogZWxidjIuVGFyZ2V0VHlwZS5MQU1CREEsXG4gICAgICB0YXJnZXRzOiBbbmV3IGVsYnYydGFyZ2V0cy5MYW1iZGFUYXJnZXQodGVuYW50QUxhbWJkYSldLFxuICAgIH0pO1xuXG4gICAgbmV3IEp3dExpc3RlbmVyUnVsZSh0aGlzLCAnVGVuYW50QUp3dFJ1bGUnLCB7XG4gICAgICBsaXN0ZW5lcjogaHR0cHNMaXN0ZW5lcixcbiAgICAgIHByaW9yaXR5OiAxMDAsXG4gICAgICBwYXRoUGF0dGVybnM6IFsnL3RlbmFudC1hLyonXSxcbiAgICAgIGp3dENvbmZpZzoge1xuICAgICAgICBpc3N1ZXI6IGlzc3VlcixcbiAgICAgICAgandrc1VyaTogandrc1VyaSxcbiAgICAgICAgY2xpZW50SWQ6IHRlbmFudEFDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIH0sXG4gICAgICB0YXJnZXRHcm91cDogdGVuYW50QVRhcmdldEdyb3VwLFxuICAgIH0pO1xuXG4gICAgLy8g44OG44OK44Oz44OIQueUqOODq+ODvOODq++8iC90ZW5hbnQtYi8q77yJXG4gICAgY29uc3QgdGVuYW50QlRhcmdldEdyb3VwID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXAodGhpcywgJ1RlbmFudEJUYXJnZXRHcm91cCcsIHtcbiAgICAgIHZwYyxcbiAgICAgIHBvcnQ6IDgwLFxuICAgICAgcHJvdG9jb2w6IGVsYnYyLkFwcGxpY2F0aW9uUHJvdG9jb2wuSFRUUCxcbiAgICAgIHRhcmdldFR5cGU6IGVsYnYyLlRhcmdldFR5cGUuTEFNQkRBLFxuICAgICAgdGFyZ2V0czogW25ldyBlbGJ2MnRhcmdldHMuTGFtYmRhVGFyZ2V0KHRlbmFudEJMYW1iZGEpXSxcbiAgICB9KTtcblxuICAgIG5ldyBKd3RMaXN0ZW5lclJ1bGUodGhpcywgJ1RlbmFudEJKd3RSdWxlJywge1xuICAgICAgbGlzdGVuZXI6IGh0dHBzTGlzdGVuZXIsXG4gICAgICBwcmlvcml0eTogMjAwLFxuICAgICAgcGF0aFBhdHRlcm5zOiBbJy90ZW5hbnQtYi8qJ10sXG4gICAgICBqd3RDb25maWc6IHtcbiAgICAgICAgaXNzdWVyOiBpc3N1ZXIsXG4gICAgICAgIGp3a3NVcmk6IGp3a3NVcmksXG4gICAgICAgIGNsaWVudElkOiB0ZW5hbnRCQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICB9LFxuICAgICAgdGFyZ2V0R3JvdXA6IHRlbmFudEJUYXJnZXRHcm91cCxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vY29nbml0by1pZHAuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3VzZXJQb29sLnVzZXJQb29sSWR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRBQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGVuYW50QUNsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdUZW5hbnQgQSBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlbmFudEJDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0ZW5hbnRCQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RlbmFudCBCIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxiRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhbGIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUxCIEROUyBOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdKd2tzVXJpJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfS8ud2VsbC1rbm93bi9qd2tzLmpzb25gLFxuICAgICAgZGVzY3JpcHRpb246ICdKV0tTIFVSSSBmb3IgSldUIHZlcmlmaWNhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSXNzdWVyJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCBJc3N1ZXInLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Rva2VuRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt1c2VyUG9vbC51c2VyUG9vbElkfS5hdXRoLiR7dGhpcy5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tL29hdXRoMi90b2tlbmAsXG4gICAgICBkZXNjcmlwdGlvbjogJ09BdXRoMiBUb2tlbiBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==