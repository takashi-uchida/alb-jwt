"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlbJwtStack = void 0;
const cdk = require("aws-cdk-lib");
const cognito = require("aws-cdk-lib/aws-cognito");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const ec2 = require("aws-cdk-lib/aws-ec2");
const acm = require("aws-cdk-lib/aws-certificatemanager");
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
exports.AlbJwtStack = AlbJwtStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWxiLWp3dC1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFsYi1qd3Qtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLG1EQUFtRDtBQUNuRCxnRUFBZ0U7QUFDaEUsMkNBQTJDO0FBQzNDLDBEQUEwRDtBQUcxRCxNQUFhLFdBQVksU0FBUSxHQUFHLENBQUMsS0FBSztJQUN4QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXNCO1FBQzlELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU07UUFDTixNQUFNLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxFQUFFLFdBQVcsRUFBRTtZQUN6QyxNQUFNLEVBQUUsQ0FBQztZQUNULFdBQVcsRUFBRSxDQUFDO1lBQ2QsbUJBQW1CLEVBQUU7Z0JBQ25CO29CQUNFLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxRQUFRO29CQUNkLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVSxDQUFDLE1BQU07aUJBQ2xDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNqRSxZQUFZLEVBQUUsMEJBQTBCO1lBQ3hDLGlCQUFpQixFQUFFLEtBQUs7WUFDeEIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxLQUFLO2dCQUNaLFFBQVEsRUFBRSxJQUFJO2FBQ2Y7WUFDRCxrQkFBa0IsRUFBRTtnQkFDbEIsS0FBSyxFQUFFO29CQUNMLFFBQVEsRUFBRSxLQUFLO29CQUNmLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2FBQ0Y7WUFDRCxnQkFBZ0IsRUFBRTtnQkFDaEIsUUFBUSxFQUFFLElBQUksT0FBTyxDQUFDLGVBQWUsQ0FBQztvQkFDcEMsTUFBTSxF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Q0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFO1lBQ2pDLEtBQUssRUFBRSx1QkFBdUIsSUFBSSxDQUFDLE1BQU0sa0JBQWtCLFFBQVEsQ0FBQyxVQUFVLHdCQUF3QjtZQUN0RyxXQUFXLEVBQUUsK0JBQStCO1NBQzdDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSx1QkFBdUIsSUFBSSxDQUFDLE1BQU0sa0JBQWtCLFFBQVEsQ0FBQyxVQUFVLEVBQUU7WUFDaEYsV0FBVyxFQUFFLFlBQVk7U0FDMUIsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFdBQVcsUUFBUSxDQUFDLFVBQVUsU0FBUyxJQUFJLENBQUMsTUFBTSxpQ0FBaUM7WUFDMUYsV0FBVyxFQUFFLHVCQUF1QjtTQUNyQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuS0Qsa0NBbUtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0ICogYXMgZWMyIGZyb20gJ2F3cy1jZGstbGliL2F3cy1lYzInO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBjbGFzcyBBbGJKd3RTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFZQQ1xuICAgIGNvbnN0IHZwYyA9IG5ldyBlYzIuVnBjKHRoaXMsICdBbGJKd3RWcGMnLCB7XG4gICAgICBtYXhBenM6IDIsXG4gICAgICBuYXRHYXRld2F5czogMCxcbiAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAge1xuICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICBuYW1lOiAnUHVibGljJyxcbiAgICAgICAgICBzdWJuZXRUeXBlOiBlYzIuU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8g44Oe44Or44OB44OG44OK44Oz44OI55SoQ29nbml0byBVc2VyIFBvb2xcbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICdNdWx0aVRlbmFudFVzZXJQb29sJywge1xuICAgICAgdXNlclBvb2xOYW1lOiAnYWxiLWp3dC1tdWx0aXRlbmFudC1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IGZhbHNlLFxuICAgICAgICB1c2VybmFtZTogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZW1haWw6IHtcbiAgICAgICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBjdXN0b21BdHRyaWJ1dGVzOiB7XG4gICAgICAgIHRlbmFudElkOiBuZXcgY29nbml0by5TdHJpbmdBdHRyaWJ1dGUoe1xuICAgICAgICAgIG1pbkxlbjogMSxcbiAgICAgICAgICBtYXhMZW46IDUwLFxuICAgICAgICAgIG11dGFibGU6IGZhbHNlLFxuICAgICAgICB9KSxcbiAgICAgIH0sXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gUmVzb3VyY2UgU2VydmVyIChBUEkg44K544Kz44O844OX5a6a576pKVxuICAgIGNvbnN0IHJlc291cmNlU2VydmVyID0gdXNlclBvb2wuYWRkUmVzb3VyY2VTZXJ2ZXIoJ0FwaVJlc291cmNlU2VydmVyJywge1xuICAgICAgaWRlbnRpZmllcjogJ2FwaScsXG4gICAgICBzY29wZXM6IFtcbiAgICAgICAgeyBzY29wZU5hbWU6ICdyZWFkJywgc2NvcGVEZXNjcmlwdGlvbjogJ1JlYWQgYWNjZXNzJyB9LFxuICAgICAgICB7IHNjb3BlTmFtZTogJ3dyaXRlJywgc2NvcGVEZXNjcmlwdGlvbjogJ1dyaXRlIGFjY2VzcycgfSxcbiAgICAgICAgeyBzY29wZU5hbWU6ICdhZG1pbicsIHNjb3BlRGVzY3JpcHRpb246ICdBZG1pbiBhY2Nlc3MnIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8g44OG44OK44Oz44OI55So44Ki44OX44Oq44Kv44Op44Kk44Ki44Oz44OI77yI5L6L77ya44OG44OK44Oz44OIQe+8iVxuICAgIGNvbnN0IHRlbmFudEFDbGllbnQgPSB1c2VyUG9vbC5hZGRDbGllbnQoJ1RlbmFudEFDbGllbnQnLCB7XG4gICAgICB1c2VyUG9vbENsaWVudE5hbWU6ICd0ZW5hbnQtYS1jbGllbnQnLFxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IHRydWUsXG4gICAgICBvQXV0aDoge1xuICAgICAgICBmbG93czoge1xuICAgICAgICAgIGNsaWVudENyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgICBzY29wZXM6IFtcbiAgICAgICAgICBjb2duaXRvLk9BdXRoU2NvcGUuY3VzdG9tKCdhcGkvcmVhZCcpLFxuICAgICAgICAgIGNvZ25pdG8uT0F1dGhTY29wZS5jdXN0b20oJ2FwaS93cml0ZScpLFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIOODhuODiuODs+ODiOeUqOOCouODl+ODquOCr+ODqeOCpOOCouODs+ODiO+8iOS+i++8muODhuODiuODs+ODiELvvIlcbiAgICBjb25zdCB0ZW5hbnRCQ2xpZW50ID0gdXNlclBvb2wuYWRkQ2xpZW50KCdUZW5hbnRCQ2xpZW50Jywge1xuICAgICAgdXNlclBvb2xDbGllbnROYW1lOiAndGVuYW50LWItY2xpZW50JyxcbiAgICAgIGdlbmVyYXRlU2VjcmV0OiB0cnVlLFxuICAgICAgb0F1dGg6IHtcbiAgICAgICAgZmxvd3M6IHtcbiAgICAgICAgICBjbGllbnRDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2NvcGVzOiBbXG4gICAgICAgICAgY29nbml0by5PQXV0aFNjb3BlLmN1c3RvbSgnYXBpL3JlYWQnKSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBBTELnlKjoqLzmmI7mm7jvvIjoh6rlt7HnvbLlkI3vvIlcbiAgICBjb25zdCBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0FsYkNlcnRpZmljYXRlJywge1xuICAgICAgZG9tYWluTmFtZTogJyouZWxiLmFtYXpvbmF3cy5jb20nLFxuICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKCksXG4gICAgfSk7XG5cbiAgICAvLyBBcHBsaWNhdGlvbiBMb2FkIEJhbGFuY2VyXG4gICAgY29uc3QgYWxiID0gbmV3IGVsYnYyLkFwcGxpY2F0aW9uTG9hZEJhbGFuY2VyKHRoaXMsICdBbGJKd3RMb2FkQmFsYW5jZXInLCB7XG4gICAgICB2cGMsXG4gICAgICBpbnRlcm5ldEZhY2luZzogdHJ1ZSxcbiAgICAgIGxvYWRCYWxhbmNlck5hbWU6ICdhbGItand0LW11bHRpdGVuYW50JyxcbiAgICB9KTtcblxuICAgIC8vIEhUVFBTIExpc3RlbmVyIHdpdGggSldUIHZlcmlmaWNhdGlvblxuICAgIGNvbnN0IGh0dHBzTGlzdGVuZXIgPSBhbGIuYWRkTGlzdGVuZXIoJ0h0dHBzTGlzdGVuZXInLCB7XG4gICAgICBwb3J0OiA0NDMsXG4gICAgICBwcm90b2NvbDogZWxidjIuQXBwbGljYXRpb25Qcm90b2NvbC5IVFRQUyxcbiAgICAgIGNlcnRpZmljYXRlczogW2NlcnRpZmljYXRlXSxcbiAgICAgIGRlZmF1bHRBY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZpeGVkUmVzcG9uc2UoMjAwLCB7XG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIG1lc3NhZ2VCb2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbWVzc2FnZTogJ0pXVCB2ZXJpZmljYXRpb24gc3VjY2VlZGVkJyxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSksXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIEpXVOaknOiovOioreWumuOCkkw344Or44O844Or44Gn5a6f6KOFXG4gICAgaHR0cHNMaXN0ZW5lci5hZGRBY3Rpb24oJ0p3dEF1dGgnLCB7XG4gICAgICBwcmlvcml0eTogMTAwLFxuICAgICAgY29uZGl0aW9uczogW1xuICAgICAgICBlbGJ2Mi5MaXN0ZW5lckNvbmRpdGlvbi5wYXRoUGF0dGVybnMoWycvKiddKSxcbiAgICAgIF0sXG4gICAgICBhY3Rpb246IGVsYnYyLkxpc3RlbmVyQWN0aW9uLmZpeGVkUmVzcG9uc2UoMjAwLCB7XG4gICAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgIG1lc3NhZ2VCb2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbWVzc2FnZTogJ0pXVCB2ZXJpZmljYXRpb24gc3VjY2VlZGVkJyxcbiAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSksXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclBvb2xEb21haW4nLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vY29nbml0by1pZHAuJHt0aGlzLnJlZ2lvbn0uYW1hem9uYXdzLmNvbS8ke3VzZXJQb29sLnVzZXJQb29sSWR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgRG9tYWluJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdUZW5hbnRBQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGVuYW50QUNsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdUZW5hbnQgQSBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1RlbmFudEJDbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0ZW5hbnRCQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ1RlbmFudCBCIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxiRG5zTmFtZScsIHtcbiAgICAgIHZhbHVlOiBhbGIubG9hZEJhbGFuY2VyRG5zTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQUxCIEROUyBOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdKd2tzVXJpJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfS8ud2VsbC1rbm93bi9qd2tzLmpzb25gLFxuICAgICAgZGVzY3JpcHRpb246ICdKV0tTIFVSSSBmb3IgSldUIHZlcmlmaWNhdGlvbicsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSXNzdWVyJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvZ25pdG8taWRwLiR7dGhpcy5yZWdpb259LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0pXVCBJc3N1ZXInLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1Rva2VuRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt1c2VyUG9vbC51c2VyUG9vbElkfS5hdXRoLiR7dGhpcy5yZWdpb259LmFtYXpvbmNvZ25pdG8uY29tL29hdXRoMi90b2tlbmAsXG4gICAgICBkZXNjcmlwdGlvbjogJ09BdXRoMiBUb2tlbiBFbmRwb2ludCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==