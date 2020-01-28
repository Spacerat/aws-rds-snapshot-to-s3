import * as kms from "@aws-cdk/aws-kms";
import * as s3 from "@aws-cdk/aws-s3";
import * as cdk from "@aws-cdk/core";
import { SnapshotExtractor } from "../snapshot-extractor";

export interface AppProps extends cdk.StackProps {}

export class AppStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: AppProps) {
    super(scope, id, props);

    // Subscribe

    new SnapshotExtractor(this, "Pipe", {
      bucket: new s3.Bucket(this, "Output"),
      key: new kms.Key(this, "Key"),
      prefix: "exports/"
    });
  }
}
