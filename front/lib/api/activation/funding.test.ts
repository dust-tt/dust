import {
  ACTIVATION_NUDGE_ORIGIN,
  type DustFundedRunFacts,
  isDustFundedActivationRun,
} from "@app/lib/api/activation/funding";
import { ACTIVATION_WEBHOOK_SOURCE_NAME } from "@app/lib/api/activation/trigger";
import type { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { WebhookSourceFactory } from "@app/tests/utils/WebhookSourceFactory";
import { WebhookSourceViewFactory } from "@app/tests/utils/WebhookSourceViewFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

// Wires a pod's activation trigger the way provisioning does: the trigger plus
// the ActivationPod row that links to it (the fact the funding check reads).
async function createPodActivationTrigger(
  auth: Authenticator,
  pod: SpaceResource
): Promise<TriggerResource> {
  const workspace = auth.getNonNullableWorkspace();
  const source = await new WebhookSourceFactory(workspace).create({
    name: ACTIVATION_WEBHOOK_SOURCE_NAME,
  });
  const podView = await new WebhookSourceViewFactory(workspace).create(pod, {
    webhookSourceId: source.sId,
  });

  const trigger = await TriggerFactory.webhook(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    status: "enabled",
    spaceId: pod.id,
    webhookSourceViewId: podView.id,
  });

  await ActivationPodResource.makeNew(auth, {
    pod,
    user: auth.getNonNullableUser(),
    trigger,
  });

  return trigger;
}

// The shape a nudge produces: system-authored opening message, first answer.
function nudgeFacts(trigger: TriggerResource): DustFundedRunFacts {
  return {
    origin: ACTIVATION_NUDGE_ORIGIN,
    conversationTriggerModelId: trigger.id,
    userMessage: { userModelId: null, rank: 0, version: 0 },
    agentMessageVersion: 0,
  };
}

describe("isDustFundedActivationRun", () => {
  it("funds the first answer to a pod nudge", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, nudgeFacts(trigger))
    ).toBe(true);
  });

  it("does not fund a message that has an author", async () => {
    const { authenticator, globalSpace, user } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        userMessage: { userModelId: user.id, rank: 0, version: 0 },
      })
    ).toBe(false);
  });

  it("does not fund a reply posted later in the nudge conversation", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        userMessage: { userModelId: null, rank: 2, version: 0 },
      })
    ).toBe(false);
  });

  it("does not fund an edited nudge", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        userMessage: { userModelId: null, rank: 0, version: 1 },
      })
    ).toBe(false);
  });

  it("does not fund a retried answer", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        agentMessageVersion: 1,
      })
    ).toBe(false);
  });

  it("does not fund a conversation that no trigger created", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        conversationTriggerModelId: null,
      })
    ).toBe(false);
  });

  it("does not fund a trigger that is not a pod's activation trigger", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    await createPodActivationTrigger(authenticator, globalSpace);

    const otherTrigger = await TriggerFactory.webhook(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      status: "enabled",
    });

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(otherTrigger),
        conversationTriggerModelId: otherTrigger.id,
      })
    ).toBe(false);
  });

  it("does not fund another origin, even with every other fact aligned", async () => {
    const { authenticator, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const trigger = await createPodActivationTrigger(
      authenticator,
      globalSpace
    );

    expect(
      await isDustFundedActivationRun(authenticator, {
        ...nudgeFacts(trigger),
        origin: "triggered",
      })
    ).toBe(false);
  });
});
