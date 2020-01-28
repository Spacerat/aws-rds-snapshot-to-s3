import * as AWS from "aws-sdk";
import { Handler, Context, SNSEvent } from "aws-lambda";

const MAX_EXPORT_TASK_IDENT_LENGTH = 60
const WHITELIST = new Set(["Manual snapshot created", "Automated snapshot created"])
const RDS = new AWS.RDS();


export interface Environment {
  IamRoleArn: string;
  S3BucketName: string;
  SnapshotArnPrefix: string
  KmsKeyArn: string;
  S3Prefix?: string;
}

function checkEnvironment(env: Partial<Environment>): asserts env is NonNullable<Environment> {
    if (!env.IamRoleArn) throw new Error("Missing IamRoleArn")
    if (!env.S3BucketName) throw new Error("Missing S3BucketName")
    if (!env.KmsKeyArn) throw new Error("Missing KmsKeyArn")
}

export const handler: Handler = async function(
  event: SNSEvent,
  context: Context
) {

  // Receive and check the message

  const props = process.env;
  checkEnvironment(props)

  const message = JSON.parse(event.Records[0].Sns.Message);
  const eventMessage = message["Event Message"]

  console.log("Message received from SNS:", eventMessage, message);

  if (!WHITELIST.has(eventMessage)) {
      console.log(`Wrong event ${eventMessage}, waiting for one of ${Array.from(WHITELIST)}`)
      return
  }

  const identifier: string = message["Source ID"];
  if (!identifier) {
      throw new Error("Message is missing Source ID")
  }

  // Sanitize the input arguments

  const uuid = context.awsRequestId;

  const ExportTaskIdentifier = trimTrailing('-', `${identifier}-${uuid}`.slice(0, MAX_EXPORT_TASK_IDENT_LENGTH))
  const S3Prefix = props.S3Prefix ? trimTrailing('/', props.S3Prefix) : undefined

  // Call the StartExportTask API

  const exportTaskArgs: AWS.RDS.Types.StartExportTaskMessage = {
    IamRoleArn: props.IamRoleArn,
    ExportTaskIdentifier,
    SourceArn: `${props.SnapshotArnPrefix}:${identifier}`,
    KmsKeyId: props.KmsKeyArn,
    S3BucketName: props.S3BucketName,
    S3Prefix
  }

  console.log("Going to run export", exportTaskArgs)
  return RDS.startExportTask(exportTaskArgs).promise()

};

function trimTrailing(what:string, from: string): string {
    return from.endsWith(what) ? from.slice(0, -what.length) : from
}
