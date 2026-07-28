import { Authenticator } from "@app/lib/auth";
import { getTaskQueueForUserMessageOrigin } from "@app/temporal/agent_loop/client";
import {
  BATCH_QUEUE_NAME,
  INTERACTIVE_QUEUE_NAME,
  PROGRAMMATIC_QUEUE_NAME,
  QUEUE_NAME,
  SCHEDULES_QUEUE_NAME,
} from "@app/temporal/agent_loop/config";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it } from "vitest";

async function setupAuth({
  withRoutingFlag,
}: {
  withRoutingFlag: boolean;
}): Promise<Authenticator> {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  if (withRoutingFlag) {
    await FeatureFlagFactory.basic(auth, "agent_loop_qos_routing");
  }
  return auth;
}

describe("getTaskQueueForUserMessageOrigin", () => {
  it("routes everything to the default queue without the feature flag", async () => {
    const auth = await setupAuth({ withRoutingFlag: false });

    expect(await getTaskQueueForUserMessageOrigin(auth, "web")).toBe(
      QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "triggered")).toBe(
      QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "api")).toBe(
      QUEUE_NAME
    );
  });

  it("routes human surfaces when the feature flag is enabled", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });

    expect(await getTaskQueueForUserMessageOrigin(auth, "web")).toBe(
      INTERACTIVE_QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "slack")).toBe(
      INTERACTIVE_QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "teams")).toBe(
      INTERACTIVE_QUEUE_NAME
    );
  });

  it("routes machine surfaces when the feature flag is enabled", async () => {
    const auth = await setupAuth({ withRoutingFlag: true });

    expect(await getTaskQueueForUserMessageOrigin(auth, "triggered")).toBe(
      SCHEDULES_QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "wakeup")).toBe(
      SCHEDULES_QUEUE_NAME
    );
    expect(
      await getTaskQueueForUserMessageOrigin(auth, "triggered_webhook")
    ).toBe(BATCH_QUEUE_NAME);
    expect(
      await getTaskQueueForUserMessageOrigin(auth, "triggered_programmatic")
    ).toBe(BATCH_QUEUE_NAME);
    expect(await getTaskQueueForUserMessageOrigin(auth, "reinforcement")).toBe(
      BATCH_QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "api")).toBe(
      PROGRAMMATIC_QUEUE_NAME
    );
    expect(await getTaskQueueForUserMessageOrigin(auth, "zapier")).toBe(
      PROGRAMMATIC_QUEUE_NAME
    );
  });
});
