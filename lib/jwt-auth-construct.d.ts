import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Construct } from 'constructs';
export interface JwtAuthActionProps {
    issuer: string;
    jwksUri: string;
    clientId: string;
    onUnauthenticatedRequest?: 'deny' | 'allow' | 'authenticate';
    next: elbv2.ListenerAction;
}
export declare class JwtAuthAction {
    static create(props: JwtAuthActionProps): any;
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
export declare class JwtListenerRule extends Construct {
    constructor(scope: Construct, id: string, props: JwtListenerRuleProps);
}
