import { emitActivationEvent } from "@app/lib/api/activation/trigger";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
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
      "Nudge all members of this Activation Pod. Emits one activation event " +
      "per member; each member's activation trigger starts a @dust " +
      "conversation running the activation workflow.",
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
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );

    const podWithGroups = await SpaceResource.fetchById(adminAuth, pod.sId);
    if (!podWithGroups) {
      return new Err(new Error(`Pod ${pod.sId} not found.`));
    }

    // The activation event is per-user (its trigger filter matches both the pod
    // and the target user), so we emit one event per pod member.
    const membersBySpaceModelId =
      await SpaceResource.fetchDistinctActiveManualGroupMembersBySpaces(
        adminAuth,
        [podWithGroups]
      );
    const members = membersBySpaceModelId.get(podWithGroups.id) ?? [];

    if (members.length === 0) {
      return new Ok({
        display: "text",
        value: `Activation Pod ${pod.sId} has no members to nudge.`,
      });
    }

    const emitResults = await concurrentExecutor(
      members,
      async (member) => {
        const result = await emitActivationEvent(adminAuth, pod, member.sId);
        return { name: member.fullName() || member.email, result };
      },
      { concurrency: 3 }
    );

    const errorMessages: string[] = [];
    for (const { name, result } of emitResults) {
      if (result.isErr()) {
        errorMessages.push(`${name}: ${result.error.message}`);
      }
    }

    sendActivationNudgeLogger.info(
      {
        action: "send_activation_nudge",
        spaceId: pod.sId,
        workspaceId: workspace.sId,
        memberCount: members.length,
        failedCount: errorMessages.length,
      },
      "Emitted activation nudge events via poke"
    );

    if (errorMessages.length > 0) {
      return new Err(
        new Error(
          `Failed to emit activation events for ${errorMessages.length}/` +
            `${members.length} member(s) of pod ${pod.sId}: ` +
            errorMessages.join("; ")
        )
      );
    }

    return new Ok({
      display: "text",
      value: `Activation nudge emitted for ${members.length} pod member(s).`,
    });
  },
  isApplicableTo: (auth, pod) => (pod ? isActivationPod(auth, pod) : false),
});
