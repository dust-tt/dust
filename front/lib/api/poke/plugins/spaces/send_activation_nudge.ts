import {
  createActivationTrigger,
  emitActivationEvent,
  getOrCreateActivationWebhookSourceView,
} from "@app/lib/api/activation/trigger";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";

const sendActivationNudgeLogger = logger.child({
  activity: "send-activation-nudge",
});

function formatMemberLabel(member: UserResource): string {
  const name = member.fullName();
  return name ? `${name} (${member.email})` : member.email;
}

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
      "Nudge selected members members of this Activation Pod, " +
      "starting a @dust conversation running the activation " +
      "workflow. All members are selected by default: deselect to nudge only " +
      "a subset.",
    resourceTypes: ["spaces"],
    args: {
      members: {
        type: "enum",
        label: "Members to nudge",
        description:
          "Members who will receive an activation nudge. All are selected by " +
          "default; deselect to nudge only some.",
        async: true,
        values: [],
        multiple: true,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth, pod) => {
    if (!pod) {
      return new Ok({ members: [] });
    }

    const workspace = auth.getNonNullableWorkspace();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );

    const membersBySpaceModelId =
      await SpaceResource.fetchDistinctActiveManualGroupMembersBySpaces(
        adminAuth,
        [pod]
      );
    const members = membersBySpaceModelId.get(pod.id) ?? [];

    return new Ok({
      members: members.map((member) => ({
        label: formatMemberLabel(member),
        value: member.sId,
        // Default to nudging everyone; support can deselect to target a subset.
        checked: true,
      })),
    });
  },
  execute: async (auth, pod, args) => {
    if (!pod) {
      return new Err(new Error("Pod not found."));
    }

    if (!(await isActivationPod(auth, pod))) {
      return new Err(new Error("This plugin only applies to Activation Pods."));
    }

    const selectedMemberIds = args.members ?? [];
    if (selectedMemberIds.length === 0) {
      return new Err(new Error("Select at least one member to nudge."));
    }

    const workspace = auth.getNonNullableWorkspace();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId,
      { dangerouslyRequestAllGroups: true }
    );

    // The activation conversation is created by a per-user trigger.
    // So to nudge a member we ensure that member has an activation trigger,
    // (provisioning one on their behalf if missing) then emit the event that fires it.
    const podViewResult = await getOrCreateActivationWebhookSourceView(
      adminAuth,
      pod
    );
    if (podViewResult.isErr()) {
      return new Err(
        new Error(
          `Failed to get or create Activation Pod webhook view: ${podViewResult.error.message}`
        )
      );
    }
    const podView = podViewResult.value;

    const existingTriggers = await TriggerResource.listByWebhookSourceViewId(
      adminAuth,
      podView.id
    );
    const memberModelIdsWithTrigger = new Set(
      removeNulls(existingTriggers.map((trigger) => trigger.editor))
    );

    const users = await UserResource.fetchByIds(selectedMemberIds);

    const outcomes = await concurrentExecutor(
      users,
      async (member) => {
        const name = member.fullName() || member.email;

        if (!memberModelIdsWithTrigger.has(member.id)) {
          const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
            member.sId,
            workspace.sId
          );
          const triggerResult = await createActivationTrigger(memberAuth, {
            pod,
            creator: member,
            podView,
          });
          if (triggerResult.isErr()) {
            return {
              name,
              status: "failed" as const,
              message: `trigger provisioning failed: ${triggerResult.error.message}`,
            };
          }
        }

        const emitResult = await emitActivationEvent(
          adminAuth,
          pod,
          member.sId
        );
        if (emitResult.isErr()) {
          return {
            name,
            status: "failed" as const,
            message: emitResult.error.message,
          };
        }

        return { name, status: "nudged" as const };
      },
      { concurrency: 3 }
    );

    const nudged: string[] = [];
    const failed: string[] = [];
    for (const outcome of outcomes) {
      if (outcome.status === "failed") {
        failed.push(`${outcome.name}: ${outcome.message}`);
      } else {
        nudged.push(outcome.name);
      }
    }

    sendActivationNudgeLogger.info(
      {
        action: "send_activation_nudge",
        spaceId: pod.sId,
        workspaceId: workspace.sId,
        selectedCount: selectedMemberIds.length,
        nudgedCount: nudged.length,
        failedCount: failed.length,
      },
      "Emitted activation nudge events via poke"
    );

    if (failed.length > 0) {
      return new Err(
        new Error(
          `Failed to nudge ${failed.length}/${selectedMemberIds.length} ` +
            `member(s) of pod ${pod.sId}: ${failed.join("; ")}`
        )
      );
    }

    return new Ok({
      display: "text",
      value:
        `Activation nudge emitted for ${nudged.length} member(s): ` +
        `${nudged.join(", ")}.`,
    });
  },
  isApplicableTo: (auth, pod) => (pod ? isActivationPod(auth, pod) : false),
});
