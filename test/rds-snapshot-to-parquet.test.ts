import {
  expect as expectCDK,
  matchTemplate,
  MatchStyle
} from "@aws-cdk/assert";
import * as cdk from "@aws-cdk/core";
import { AppStack } from "../lib/stacks/app-stack";

test("Empty Stack", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new AppStack(app, "MyTestStack");
  // THEN

  // expectCDK(stack).to(
  //   matchTemplate(
  //     {
  //       Resources: {}
  //     },
  //     MatchStyle.EXACT
  //   )
  // );
});
