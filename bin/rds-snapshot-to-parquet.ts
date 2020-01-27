#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { AppStack, DatabaseStack, NetworkStack } from "../lib/stacks";

const app = new cdk.App();

const network = new NetworkStack(app, "Network");

const database = new DatabaseStack(app, "Database", {
  vpc: network.vpc
});

new AppStack(app, "App", {});
