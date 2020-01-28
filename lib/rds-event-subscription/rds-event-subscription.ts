import * as cdk from "@aws-cdk/core";
import * as rds from "@aws-cdk/aws-rds";
import * as sns from "@aws-cdk/aws-sns";

/**
 * EventCategory specifies a kind of RDS notification to receive.
 * The full list of events is here:
 * https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_Events.html#USER_Events.Messages
 */
export enum EventCategory {
  Availability = "availability",
  Backup = "backup",
  ConfigurationChange = "configuration change",
  Creation = "creation",
  Deletion = "deletion",
  Failover = "failover",
  Failure = "failure",
  LowStorage = "low storage",
  Maintenance = "maintenance",
  Notification = "notification",
  ReadReplica = "read replica",
  Recovery = "recovery",
  Restoration = "restoration"
}

/**
 * SourceType specifies an event source
 */
export enum SourceType {
  Instance = "db-instance",
  ParameterGroup = "db-parameter-group",
  Snapshot = "db-snapshot",
  SecurityGroup = 'db-security-group'
}

  
export interface EventSubscriptionProps extends cdk.ResourceProps {
  /** The SNS topic to publish to */
  topic: sns.ITopic;
  
  /** When true (the default), actually publish events */
  enabled?: boolean;
  
  /** The list of event categories to subscribe to. When not provided, subscribe to all categories */
  eventCategories?: EventCategory[];

  /** Filter events by what exactly generated them */
  source?: {
    /** The type of source which will be generating events */
    type: SourceType;

    /** A list of identifiers for even sources. If not specified, all sources are included. */
    ids?: string[];
  };
}

export interface IEventSubscription {}

/**
 * EventSubscription configures RDS to publish events to an SNS topic.
 */
export class EventSubscription extends cdk.Resource implements IEventSubscription {
  constructor(scope: cdk.Construct, id: string, props: EventSubscriptionProps) {
    super(scope, id, props);

    const { enabled = true } = props;
    
    new rds.CfnEventSubscription(this, "Resource", {
      snsTopicArn: props.topic.topicArn,
      enabled: enabled,
      eventCategories: props.eventCategories,
      sourceType: props.source?.type,
      sourceIds: props.source?.ids
    });
  }
}
