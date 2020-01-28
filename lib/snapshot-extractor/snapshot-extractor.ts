import * as iam from "@aws-cdk/aws-iam";
import * as kms from "@aws-cdk/aws-kms";
import * as lambda from "@aws-cdk/aws-lambda";
import * as s3 from "@aws-cdk/aws-s3";
import * as sns from "@aws-cdk/aws-sns";
import * as subs from "@aws-cdk/aws-sns-subscriptions";
import * as cdk from "@aws-cdk/core";
import * as rds_events from "../rds-event-subscription";
import { Environment as FunctionEnvironment } from "./lambda/exporter";
import * as path from "path";

// SnapshotTypeSpec asserts that at least one type is specified
type SnapshotTypeSpec =
  | { manual: true; automated?: false }
  | { manual?: false; automated: true }
  | { manual: true; automated: true };

const MANUAL_SNAPSHOT = "Manual snapshot created";
const AUTOMATED_SNAPSHOT = "Automated snapshot created";

/** Properties of a new SnapshotExtractor */
export interface SnapshotExtractorProps {
  /** The S3 bucket to export snapshots to */
  bucket: s3.IBucket;

  /** The KMS key used to encrypt the export */
  key: kms.IKey;

  /** The path within the bucket to export snapshots to */
  prefix?: string;

  /** Optionally specify a destination to notify when the lambda function succeeds */
  onStartExportFunctionSuccess?: lambda.IDestination;

  /** Optionally specify a destination to notify when the lambda function fails */
  onStartExportFunctionFailure?: lambda.IDestination;

  /** The types (manual, automated) of snapshot to export */
  snapshotTypes: SnapshotTypeSpec;

  /** Filter snapshots by name */
  filterSnapshotName?: {
    /** Filter by name prefix */
    prefix: string;
  };
}

/** Interface for an automatic RDS to S3 Snapshot Extractor service */
export interface ISnapshotExtractor extends cdk.IConstruct {
  /** An SNS topic which receives RDS snapshot events  */
  readonly snapshotTopic: sns.ITopic;

  /** The lambda function which starts export tasks */
  readonly exportFunction: lambda.IFunction;
}

/** Create a new automatic RDS to S3 Snapshot Extractor service */
export class SnapshotExtractor extends cdk.Construct
  implements ISnapshotExtractor {
  public readonly snapshotTopic: sns.ITopic;
  public readonly exportFunction: lambda.IFunction;

  constructor(scope: cdk.Construct, id: string, props: SnapshotExtractorProps) {
    super(scope, id);

    // Create a role which grants RDS access to S3

    const RDS = new iam.ServicePrincipal("export.rds.amazonaws.com");
    const exportRole = new iam.Role(this, "ExportRole", { assumedBy: RDS });
    const { prefix = "" } = props;
    const prefixAll = `${prefix}*`;
    props.bucket.grantPut(exportRole, prefixAll);
    props.bucket.grantDelete(exportRole, prefixAll);
    props.bucket.grantRead(exportRole, prefix);
    props.bucket.grantRead(exportRole, prefixAll);

    // Create a lambda function which responds to snapshots by starting an export

    const snapshotTypes = [];
    if (props.snapshotTypes.manual) snapshotTypes.push(MANUAL_SNAPSHOT);
    if (props.snapshotTypes.automated) snapshotTypes.push(AUTOMATED_SNAPSHOT);

    const environment: FunctionEnvironment = {
      IamRoleArn: exportRole.roleArn,
      S3BucketName: props.bucket.bucketName,
      S3Prefix: props.prefix,
      KmsKeyArn: props.key.keyArn,
      SnapshotArnPrefix: cdk.Stack.of(this).formatArn({
        service: "rds",
        resource: "snapshot"
      }),
      Events: snapshotTypes.join(","),
      PrefixFilter: props.filterSnapshotName?.prefix
    };

    this.exportFunction = new lambda.Function(this, "Exporter", {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "exporter.handler",
      code: lambda.Code.fromAsset(path.join(__dirname, "lambda")),
      description: "Automatically exports snapshots to S3",
      environment: environment as any,
      onSuccess: props.onStartExportFunctionSuccess,
      onFailure: props.onStartExportFunctionFailure
    });
    exportRole.grantPassRole(this.exportFunction.grantPrincipal);

    this.exportFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["rds:StartExportTask"],
        resources: ["*"]
      })
    );

    // The export function requires the same permissions as those needed to copy a database snapshot.
    // https://stackoverflow.com/questions/45821144/minimal-kms-permissions-to-copy-a-database-snapshot
    props.key.grant(this.exportFunction, "kms:DescribeKey", "kms:CreateGrant");

    // Subscribe the lambda function to snapshot events

    this.snapshotTopic = new sns.Topic(this, "topic", {
      displayName: "Topic for RDS snapshot creation events."
    });

    new rds_events.EventSubscription(this, "Subscription", {
      topic: this.snapshotTopic,
      source: { type: rds_events.SourceType.Snapshot },
      eventCategories: [rds_events.EventCategory.Creation]
    });

    this.snapshotTopic.addSubscription(
      new subs.LambdaSubscription(this.exportFunction)
    );
  }
}
