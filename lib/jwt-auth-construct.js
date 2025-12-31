"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtListenerRule = exports.JwtAuthAction = void 0;
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const constructs_1 = require("constructs");
class JwtAuthAction {
    static create(props) {
        return {
            type: 'authenticate-jwt',
            order: 1,
            authenticateJwtConfig: {
                issuer: props.issuer,
                jwksUri: props.jwksUri,
                userPoolClientId: props.clientId,
                onUnauthenticatedRequest: props.onUnauthenticatedRequest || 'deny',
            },
        };
    }
}
exports.JwtAuthAction = JwtAuthAction;
class JwtListenerRule extends constructs_1.Construct {
    constructor(scope, id, props) {
        super(scope, id);
        // CfnListenerRuleを直接作成してJWT認証を設定
        new elbv2.CfnListenerRule(this, 'Rule', {
            listenerArn: props.listener.listenerArn,
            priority: props.priority,
            conditions: [
                {
                    field: 'path-pattern',
                    values: props.pathPatterns,
                },
            ],
            actions: [
                {
                    type: 'authenticate-jwt',
                    order: 1,
                    authenticateJwtConfig: {
                        issuer: props.jwtConfig.issuer,
                        jwksUri: props.jwtConfig.jwksUri,
                        userPoolClientId: props.jwtConfig.clientId,
                        onUnauthenticatedRequest: 'deny',
                    },
                },
                {
                    type: 'forward',
                    order: 2,
                    forwardConfig: {
                        targetGroups: [
                            {
                                targetGroupArn: props.targetGroup.targetGroupArn,
                                weight: 100,
                            },
                        ],
                    },
                },
            ],
        });
    }
}
exports.JwtListenerRule = JwtListenerRule;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiand0LWF1dGgtY29uc3RydWN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiand0LWF1dGgtY29uc3RydWN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLGdFQUFnRTtBQUNoRSwyQ0FBdUM7QUFVdkMsTUFBYSxhQUFhO0lBQ2pCLE1BQU0sQ0FBQyxNQUFNLENBQUMsS0FBeUI7UUFDNUMsT0FBTztZQUNMLElBQUksRUFBRSxrQkFBa0I7WUFDeEIsS0FBSyxFQUFFLENBQUM7WUFDUixxQkFBcUIsRUFBRTtnQkFDckIsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNO2dCQUNwQixPQUFPLEVBQUUsS0FBSyxDQUFDLE9BQU87Z0JBQ3RCLGdCQUFnQixFQUFFLEtBQUssQ0FBQyxRQUFRO2dCQUNoQyx3QkFBd0IsRUFBRSxLQUFLLENBQUMsd0JBQXdCLElBQUksTUFBTTthQUNuRTtTQUNGLENBQUM7SUFDSixDQUFDO0NBQ0Y7QUFiRCxzQ0FhQztBQWNELE1BQWEsZUFBZ0IsU0FBUSxzQkFBUztJQUM1QyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQTJCO1FBQ25FLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIsaUNBQWlDO1FBQ2pDLElBQUksS0FBSyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFO1lBQ3RDLFdBQVcsRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLFdBQVc7WUFDdkMsUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO1lBQ3hCLFVBQVUsRUFBRTtnQkFDVjtvQkFDRSxLQUFLLEVBQUUsY0FBYztvQkFDckIsTUFBTSxFQUFFLEtBQUssQ0FBQyxZQUFZO2lCQUMzQjthQUNGO1lBQ0QsT0FBTyxFQUFFO2dCQUNQO29CQUNFLElBQUksRUFBRSxrQkFBa0I7b0JBQ3hCLEtBQUssRUFBRSxDQUFDO29CQUNSLHFCQUFxQixFQUFFO3dCQUNyQixNQUFNLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxNQUFNO3dCQUM5QixPQUFPLEVBQUUsS0FBSyxDQUFDLFNBQVMsQ0FBQyxPQUFPO3dCQUNoQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsU0FBUyxDQUFDLFFBQVE7d0JBQzFDLHdCQUF3QixFQUFFLE1BQU07cUJBQ2pDO2lCQUNLO2dCQUNSO29CQUNFLElBQUksRUFBRSxTQUFTO29CQUNmLEtBQUssRUFBRSxDQUFDO29CQUNSLGFBQWEsRUFBRTt3QkFDYixZQUFZLEVBQUU7NEJBQ1o7Z0NBQ0UsY0FBYyxFQUFFLEtBQUssQ0FBQyxXQUFXLENBQUMsY0FBYztnQ0FDaEQsTUFBTSxFQUFFLEdBQUc7NkJBQ1o7eUJBQ0Y7cUJBQ0Y7aUJBQ0Y7YUFDRjtTQUNGLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXhDRCwwQ0F3Q0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgZWxidjIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWVsYXN0aWNsb2FkYmFsYW5jaW5ndjInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSnd0QXV0aEFjdGlvblByb3BzIHtcbiAgaXNzdWVyOiBzdHJpbmc7XG4gIGp3a3NVcmk6IHN0cmluZztcbiAgY2xpZW50SWQ6IHN0cmluZztcbiAgb25VbmF1dGhlbnRpY2F0ZWRSZXF1ZXN0PzogJ2RlbnknIHwgJ2FsbG93JyB8ICdhdXRoZW50aWNhdGUnO1xuICBuZXh0OiBlbGJ2Mi5MaXN0ZW5lckFjdGlvbjtcbn1cblxuZXhwb3J0IGNsYXNzIEp3dEF1dGhBY3Rpb24ge1xuICBwdWJsaWMgc3RhdGljIGNyZWF0ZShwcm9wczogSnd0QXV0aEFjdGlvblByb3BzKTogYW55IHtcbiAgICByZXR1cm4ge1xuICAgICAgdHlwZTogJ2F1dGhlbnRpY2F0ZS1qd3QnLFxuICAgICAgb3JkZXI6IDEsXG4gICAgICBhdXRoZW50aWNhdGVKd3RDb25maWc6IHtcbiAgICAgICAgaXNzdWVyOiBwcm9wcy5pc3N1ZXIsXG4gICAgICAgIGp3a3NVcmk6IHByb3BzLmp3a3NVcmksXG4gICAgICAgIHVzZXJQb29sQ2xpZW50SWQ6IHByb3BzLmNsaWVudElkLFxuICAgICAgICBvblVuYXV0aGVudGljYXRlZFJlcXVlc3Q6IHByb3BzLm9uVW5hdXRoZW50aWNhdGVkUmVxdWVzdCB8fCAnZGVueScsXG4gICAgICB9LFxuICAgIH07XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBKd3RMaXN0ZW5lclJ1bGVQcm9wcyB7XG4gIGxpc3RlbmVyOiBlbGJ2Mi5BcHBsaWNhdGlvbkxpc3RlbmVyO1xuICBwcmlvcml0eTogbnVtYmVyO1xuICBwYXRoUGF0dGVybnM6IHN0cmluZ1tdO1xuICBqd3RDb25maWc6IHtcbiAgICBpc3N1ZXI6IHN0cmluZztcbiAgICBqd2tzVXJpOiBzdHJpbmc7XG4gICAgY2xpZW50SWQ6IHN0cmluZztcbiAgfTtcbiAgdGFyZ2V0R3JvdXA6IGVsYnYyLkFwcGxpY2F0aW9uVGFyZ2V0R3JvdXA7XG59XG5cbmV4cG9ydCBjbGFzcyBKd3RMaXN0ZW5lclJ1bGUgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogSnd0TGlzdGVuZXJSdWxlUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gQ2ZuTGlzdGVuZXJSdWxl44KS55u05o6l5L2c5oiQ44GX44GmSldU6KqN6Ki844KS6Kit5a6aXG4gICAgbmV3IGVsYnYyLkNmbkxpc3RlbmVyUnVsZSh0aGlzLCAnUnVsZScsIHtcbiAgICAgIGxpc3RlbmVyQXJuOiBwcm9wcy5saXN0ZW5lci5saXN0ZW5lckFybixcbiAgICAgIHByaW9yaXR5OiBwcm9wcy5wcmlvcml0eSxcbiAgICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGZpZWxkOiAncGF0aC1wYXR0ZXJuJyxcbiAgICAgICAgICB2YWx1ZXM6IHByb3BzLnBhdGhQYXR0ZXJucyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBhY3Rpb25zOiBbXG4gICAgICAgIHtcbiAgICAgICAgICB0eXBlOiAnYXV0aGVudGljYXRlLWp3dCcsXG4gICAgICAgICAgb3JkZXI6IDEsXG4gICAgICAgICAgYXV0aGVudGljYXRlSnd0Q29uZmlnOiB7XG4gICAgICAgICAgICBpc3N1ZXI6IHByb3BzLmp3dENvbmZpZy5pc3N1ZXIsXG4gICAgICAgICAgICBqd2tzVXJpOiBwcm9wcy5qd3RDb25maWcuandrc1VyaSxcbiAgICAgICAgICAgIHVzZXJQb29sQ2xpZW50SWQ6IHByb3BzLmp3dENvbmZpZy5jbGllbnRJZCxcbiAgICAgICAgICAgIG9uVW5hdXRoZW50aWNhdGVkUmVxdWVzdDogJ2RlbnknLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0gYXMgYW55LFxuICAgICAgICB7XG4gICAgICAgICAgdHlwZTogJ2ZvcndhcmQnLFxuICAgICAgICAgIG9yZGVyOiAyLFxuICAgICAgICAgIGZvcndhcmRDb25maWc6IHtcbiAgICAgICAgICAgIHRhcmdldEdyb3VwczogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0R3JvdXBBcm46IHByb3BzLnRhcmdldEdyb3VwLnRhcmdldEdyb3VwQXJuLFxuICAgICAgICAgICAgICAgIHdlaWdodDogMTAwLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfVxufVxuIl19