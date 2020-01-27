import * as cdk from "@aws-cdk/core";
import * as sns from "@aws-cdk/aws-sns";
import * as subs from "@aws-cdk/aws-sns-subscriptions";
import * as dests from "@aws-cdk/aws-lambda-destinations";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import * as kms from "@aws-cdk/aws-kms";
import * as sqs from "@aws-cdk/aws-sqs";
import { Environment as FunctionEnvironment } from "../../lambdas/exporter";

import {
  EventSubscription,
  EventCategory,
  SourceType
} from "../lib/rds-event-subscription";

export interface SnapshotPipeProps extends cdk.ResourceProps {
  bucket: s3.IBucket;
  key: kms.IKey;
  prefix?: string;
  onStartExportFunctionFailure?: lambda.IDestination;
  onStartExportFunctionSuccess?: lambda.IDestination;
}

export class SnapshotPipe extends cdk.Resource {
  public readonly topic: sns.ITopic;
  public readonly exportFunction: lambda.IFunction;

  constructor(scope: cdk.Construct, id: string, props: SnapshotPipeProps) {
    super(scope, id, props);

    // Create a role which grants RDS access to S3

    const exportRole = new iam.Role(this, "ExportRole", {
      assumedBy: new iam.ServicePrincipal("export.rds.amazonaws.com")
    });

    const { prefix = "" } = props;
    const prefixAll = `${prefix}*`;
    props.bucket.grantPut(exportRole, prefixAll);
    props.bucket.grantDelete(exportRole, prefixAll);
    props.bucket.grantRead(exportRole, prefix);
    props.bucket.grantRead(exportRole, prefixAll);

    // Create a lambda function which responds to snapshots by starting an export

    const environment: FunctionEnvironment = {
      IamRoleArn: exportRole.roleArn,
      S3BucketName: props.bucket.bucketName,
      KmsKeyArn: props.key.keyArn,
      SnapshotArnPrefix: this.stack.formatArn({
        service: "rds",
        resource: "snapshot"
      })
    };
    if (props.prefix) {
      environment.S3Prefix = props.prefix;
    }

    this.exportFunction = new lambda.Function(this, "Exporter", {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "exporter.handler",
      code: lambda.Code.fromAsset("lambdas"),
      description: "Automatically exports snapshots to S3",
      environment: environment as any,
      onSuccess: props.onStartExportFunctionSuccess,
      onFailure: props.onStartExportFunctionFailure
    });

    exportRole.grantPassRole(this.exportFunction.grantPrincipal);

    iam.Grant.addToPrincipal({
      grantee: this.exportFunction,
      resourceArns: ["*"],
      actions: [
        "rds:StartExportTask",
        "*" // XXX: remove
      ]
    });

    // Subscribe the lambda function to snapshot events

    this.topic = new sns.Topic(this, "topic", {
      displayName: "Topic for RDS snapshot creation events."
    });

    new EventSubscription(this, "Subscription", {
      topic: this.topic,
      source: { type: SourceType.Snapshot },
      eventCategories: [EventCategory.Creation]
    });

    this.topic.addSubscription(
      new subs.LambdaSubscription(this.exportFunction)
    );
  }
}

export interface AppProps extends cdk.StackProps {}

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: AppProps) {
    super(scope, id, props);

    // Create a queue for notifications

    const queue = new sqs.Queue(this, "Queue");
    const resultSub = new subs.SqsSubscription(queue);
    const results = new sns.Topic(this, "Results", {
      displayName: "Result notification for exports"
    });
    const resultDestination = new dests.SnsDestination(results);

    // Subscribe

    const pipe = new SnapshotPipe(this, "Pipe", {
      bucket: new s3.Bucket(this, "Output"),
      key: new kms.Key(this, "Key"),
      prefix: "exports/",
      onStartExportFunctionSuccess: resultDestination,
      onStartExportFunctionFailure: resultDestination
    });

    pipe.topic.addSubscription(resultSub);
  }
}
