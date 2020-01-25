#!/usr/bin/env node
import 'source-map-support/register';
import cdk = require('@aws-cdk/core');
import { RdsSnapshotToParquetStack } from '../lib/rds-snapshot-to-parquet-stack';

const app = new cdk.App();
new RdsSnapshotToParquetStack(app, 'RdsSnapshotToParquetStack');
