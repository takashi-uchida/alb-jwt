#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AlbJwtStack } from '../lib/alb-jwt-stack';

const app = new cdk.App();
new AlbJwtStack(app, 'AlbJwtStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
