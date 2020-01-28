import * as AWS from "aws-sdk";
import { Handler, Context, SNSEvent } from "aws-lambda";

const MAX_IDENT_LEN = 60;

const RDS = new AWS.RDS();

export type Environment = {
  IamRoleArn: string;
  S3BucketName: string;
  SnapshotArnPrefix: string;
  KmsKeyArn: string;
  S3Prefix?: string;
  Events: string;
  PrefixFilter?: string;
};

function checkEnvironment(env: Partial<Environment>): asserts env is NonNullable<Environment>  {
  if (!env.IamRoleArn) throw new Error("Missing IamRoleArn");
  if (!env.S3BucketName) throw new Error("Missing S3BucketName");
  if (!env.KmsKeyArn) throw new Error("Missing KmsKeyArn");
  if (!env.Events) throw new Error("Missing events");
}

export const handler: Handler = async function(
  event: SNSEvent,
  context: Context
) {
  // Decode and check the message and function environment

  const props = process.env;
  checkEnvironment(props);

  const events = new Set(props.Events.split(","));

  const message = JSON.parse(event.Records[0].Sns.Message);
  const eventMessage = message["Event Message"];

  console.log("Message received from SNS:", eventMessage, message);

  if (!events.has(eventMessage)) {
    console.log(
      `Wrong event ${eventMessage}, waiting for one of ${Array.from(events)}`
    );
    return;
  }

  const identifier: string = message["Source ID"];
  if (!identifier) {
    throw new Error("Message is missing Source ID");
  }

  if (props.PrefixFilter && !identifier.startsWith(props.PrefixFilter)) {
    console.log(
      `Ignoring snapshot ${identifier} which does not start with ${props.PrefixFilter}`
    );
  }

  // Sanitize the message parameters

  const uuid = context.awsRequestId;

  const ExportTaskIdentifier = trimTrailing(
    "-",
    `${identifier}-${uuid}`.slice(0, MAX_IDENT_LEN)
  );
  const S3Prefix = props.S3Prefix
    ? trimTrailing("/", props.S3Prefix)
    : undefined;

  // Call the StartExportTask API

  const exportTaskArgs: AWS.RDS.Types.StartExportTaskMessage = {
    IamRoleArn: props.IamRoleArn,
    ExportTaskIdentifier,
    SourceArn: `${props.SnapshotArnPrefix}:${identifier}`,
    KmsKeyId: props.KmsKeyArn,
    S3BucketName: props.S3BucketName,
    S3Prefix
  };

  console.log("Going to run export", exportTaskArgs);
  return RDS.startExportTask(exportTaskArgs).promise();
};

function trimTrailing(what: string, from: string): string {
  return from.endsWith(what) ? from.slice(0, -what.length) : from;
}
