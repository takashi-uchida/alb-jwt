import * as cdk from 'aws-cdk-lib';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';

export interface JwtAuthActionProps {
  issuer: string;
  jwksUri: string;
  clientId: string;
  onUnauthenticatedRequest?: 'deny' | 'allow' | 'authenticate';
  next: elbv2.ListenerAction;
}

export class JwtAuthAction {
  public static create(props: JwtAuthActionProps): any {
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

export interface JwtListenerRuleProps {
  listener: elbv2.ApplicationListener;
  priority: number;
  pathPatterns: string[];
  jwtConfig: {
    issuer: string;
    jwksUri: string;
    clientId: string;
  };
  targetGroup: elbv2.ApplicationTargetGroup;
}

export class JwtListenerRule extends Construct {
  constructor(scope: Construct, id: string, props: JwtListenerRuleProps) {
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
        } as any,
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
