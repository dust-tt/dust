import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";

const sendActivationNudgeLogger = logger.child({
  activity: "send-activation-nudge",
});

// Whether the pod was provisioned through the activation flow. Gates both
// visibility (isApplicableTo) and execution.
async function isActivationPod(
  auth: Authenticator,
  pod: SpaceResource
): Promise<boolean> {
  if (!pod.isProject()) {
    return false;
  }

  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  return metadata?.provisioningSource === "activation";
}

export const sendActivationNudgePlugin = createPlugin({
  manifest: {
    id: "send-activation-nudge",
    name: "Send Activation Nudge",
    description:
      "Nudge all members of this Activation Pod. Emits a single activation " +
      "event; the pod's per-member triggers each start a @dust conversation " +
      "running the activation workflow.",
    resourceTypes: ["spaces"],
    args: {},
    requiredRoles: ["support"],
  },
  execute: async (auth, pod) => {
    if (!pod) {
      return new Err(new Error("Pod not found."));
    }

    if (!(await isActivationPod(auth, pod))) {
      return new Err(new Error("This plugin only applies to Activation Pods."));
    }

    const workspace = auth.getNonNullableWorkspace();

    // Emit a single activation event for the pod which creates individual
    // conversations for all pod members.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const emitResult = await emitActivationEvent(adminAuth, pod);
    if (emitResult.isErr()) {
      return new Err(
        new Error(
          `Failed to emit activation event for pod ${pod.sId}: ${emitResult.error.message}`
        )
      );
    }

    sendActivationNudgeLogger.info(
      {
        action: "send_activation_nudge",
        spaceId: pod.sId,
        workspaceId: workspace.sId,
      },
      "Emitted activation nudge event via poke"
    );

    return new Ok({
      display: "text",
      value:
        "Activation nudge event emitted. Each pod member with an activation " +
        "trigger will receive a @dust conversation.",
    });
  },
  isApplicableTo: (auth, pod) => (pod ? isActivationPod(auth, pod) : false),
});
