import * as AWS from "aws-sdk";
import { Handler, Context, SNSEvent } from "aws-lambda";

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
  const props = process.env;
  checkEnvironment(props)

  const message = JSON.parse(event.Records[0].Sns.Message);
  console.log("Message received from SNS:", message);

  if (message["Event Message"] != "Manual snapshot created") {
      console.log("Wrong message")
      return
  }

  const identifier: string = message["Source ID"];
  if (!identifier) {
      throw new Error("Message is missing Source ID")
  }
  const uuid = context.awsRequestId;

  const exportTaskArgs = {
    IamRoleArn: props.IamRoleArn,
    ExportTaskIdentifier: `${identifier}-${uuid}`,
    SourceArn: `${props.SnapshotArnPrefix}:${identifier}`,
    KmsKeyId: props.KmsKeyArn,
    S3BucketName: props.S3BucketName,
    S3Prefix: props.S3Prefix
  }

  console.log("Going to run export", exportTaskArgs)

  return RDS.startExportTask(exportTaskArgs).promise()
};
