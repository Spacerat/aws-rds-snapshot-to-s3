import * as kms from "@aws-cdk/aws-kms";
import * as dests from "@aws-cdk/aws-lambda-destinations";
import * as s3 from "@aws-cdk/aws-s3";
import * as sns from "@aws-cdk/aws-sns";
import * as subs from "@aws-cdk/aws-sns-subscriptions";
import * as sqs from "@aws-cdk/aws-sqs";
import * as cdk from "@aws-cdk/core";
import { SnapshotExtractor } from "../snapshot-extractor";

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

    const pipe = new SnapshotExtractor(this, "Pipe", {
      bucket: new s3.Bucket(this, "Output"),
      key: new kms.Key(this, "Key"),
      prefix: "exports/",
      onStartExportFunctionSuccess: resultDestination,
      onStartExportFunctionFailure: resultDestination
    });

    pipe.topic.addSubscription(resultSub);
  }
}
