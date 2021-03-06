import * as cdk from "@aws-cdk/core";
import * as rds from "@aws-cdk/aws-rds";
import * as ec2 from "@aws-cdk/aws-ec2";

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
}

export class DatabaseStack extends cdk.Stack {
  public readonly instance: rds.IDatabaseInstance;

  constructor(scope: cdk.Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    // Create a tiny publicly accessible database for testing purposes

    this.instance = new rds.DatabaseInstance(this, "Resource", {
      vpc: props.vpc,
      vpcPlacement: { subnetType: ec2.SubnetType.PUBLIC },
      masterUsername: "joe",
      instanceClass: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE2,
        ec2.InstanceSize.MICRO
      ),
      engine: rds.DatabaseInstanceEngine.POSTGRES,
      deletionProtection: false,
      databaseName: "dev"
    });
    this.instance.connections.allowDefaultPortFromAnyIpv4();
  }
}
