import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { createPlugin } from "@app/lib/api/poke/types";
import { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { EnumValue } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";

const sendActivationNudgeLogger = logger.child({
  activity: "send-activation-nudge",
});

// The "All pod members" sentinel value for the recipients dropdown.
// Selecting this creates a new activation nudge conversation for each member.
const ALL_MEMBERS_VALUE = "__all_pod_members__";

const ACTIVATION_NUDGE_MESSAGE = `Run the activation workflow.`;

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

function memberLabel(user: UserResource): string {
  const fullName = user.fullName();
  return fullName ? `${fullName} (${user.email})` : user.email;
}

// Resolves the selected dropdown values to the actual recipient users. Selecting
// the "All pod members" sentinel (or selecting nothing) targets every current
// pod member; otherwise only the explicitly selected members are targeted.
async function resolveRecipients(
  auth: Authenticator,
  pod: SpaceResource,
  selected: string[]
): Promise<UserResource[]> {
  const members = await pod.fetchDistinctActiveManualGroupMembers(auth);

  const wantsAll =
    selected.length === 0 || selected.includes(ALL_MEMBERS_VALUE);
  if (wantsAll) {
    return members;
  }

  const selectedIds = new Set(selected);
  return members.filter((member) => selectedIds.has(member.sId));
}

export const sendActivationNudgePlugin = createPlugin({
  manifest: {
    id: "send-activation-nudge",
    name: "Send Activation Nudge",
    description:
      "Create and send an activation nudge conversation to selected pod members (or all of them).",
    resourceTypes: ["spaces"],
    args: {
      recipients: {
        type: "enum",
        label: "Recipients",
        description:
          "Pod members to nudge. Select 'All pod members' (or leave empty) to " +
          "nudge everyone. One conversation is created per recipient.",
        async: true,
        values: [],
        multiple: true,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth, pod) => {
    if (!pod) {
      return new Ok({ recipients: [] });
    }

    const members = await pod.fetchDistinctActiveManualGroupMembers(auth);

    const recipients: EnumValue[] = [
      { label: "All pod members", value: ALL_MEMBERS_VALUE, checked: true },
      ...members
        .map((member) => ({
          label: memberLabel(member),
          value: member.sId,
          checked: false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];

    return new Ok({ recipients });
  },
  execute: async (auth, pod, { recipients: selectedRecipients }) => {
    if (!pod) {
      return new Err(new Error("Pod not found."));
    }

    if (!(await isActivationPod(auth, pod))) {
      return new Err(new Error("This plugin only applies to Activation Pods."));
    }

    const workspace = auth.getNonNullableWorkspace();

    const recipients = await resolveRecipients(
      auth,
      pod,
      selectedRecipients ?? []
    );
    if (recipients.length === 0) {
      return new Err(new Error("No matching pod members to nudge."));
    }

    // The activation skill, referenced the same way join_activation_pod does
    // (by its stable sId, active only), so it can be attached to each
    // conversation.
    const [activationSkillResource] = await SkillResource.fetchByIds(
      auth,
      [activationSkill.sId],
      { onlyActive: true }
    );
    if (!activationSkillResource) {
      return new Err(
        new Error("Activation skill not found in this workspace.")
      );
    }

    // The agent the nudge is addressed to (@dust), fetched once so its mention
    // can be serialized into the first message, mirroring how a trigger posts
    // its initial message.
    const dustAgent = await getAgentConfiguration(auth, {
      agentId: GLOBAL_AGENTS_SID.DUST,
      variant: "full",
    });
    if (!dustAgent) {
      return new Err(new Error("Dust agent not found in this workspace."));
    }

    // One conversation per recipient. Sequential DB writes to avoid
    // connection-pool pressure. Each conversation runs as the recipient (a pod
    // member) so it is created, skilled, and posted on their behalf.
    const created: { userId: string; conversationId: string }[] = [];
    for (const recipient of recipients) {
      const recipientAuth = await Authenticator.fromUserIdAndWorkspaceId(
        recipient.sId,
        workspace.sId
      );

      const conversation = await createConversation(recipientAuth, {
        title: `Activation Nudge — ${recipient.fullName() ?? recipient.email}`,
        visibility: "unlisted",
        spaceId: pod.id,
      });

      // Attach the activation skill to the conversation so @dust runs it.
      const skillRes = await SkillResource.upsertConversationSkills(
        recipientAuth,
        {
          conversation,
          skills: [activationSkillResource],
          enabled: true,
        }
      );
      if (skillRes.isErr()) {
        return new Err(
          new Error(
            `Failed to add activation skill to conversation for ${recipient.sId}: ${skillRes.error.message}`
          )
        );
      }

      const userJson = recipient.toJSON();
      const context: UserMessageContext = {
        username: userJson.username,
        fullName: userJson.fullName,
        email: userJson.email,
        profilePictureUrl: userJson.image,
        // UTC since this runs server-side without the user's timezone.
        timezone: "UTC",
        origin: "triggered",
      };

      // Post the nudge as the user's first message to @dust: the serialized
      // agent mention followed by the nudge body, exactly like a trigger's
      // initial message (serializeMention + customPrompt).
      const postRes = await postUserMessage(recipientAuth, {
        conversation,
        content:
          serializeMention(dustAgent) +
          (ACTIVATION_NUDGE_MESSAGE ? `\n\n${ACTIVATION_NUDGE_MESSAGE}` : ""),
        mentions: [{ configurationId: dustAgent.sId }],
        context,
        skipToolsValidation: false,
      });
      if (postRes.isErr()) {
        return new Err(
          new Error(
            `Failed to post nudge for ${recipient.sId}: ${postRes.error.api_error.message}`
          )
        );
      }

      created.push({
        userId: recipient.sId,
        conversationId: conversation.sId,
      });
    }

    sendActivationNudgeLogger.info(
      {
        action: "send_activation_nudge",
        conversations: created,
        recipientCount: created.length,
        spaceId: pod.sId,
        workspaceId: workspace.sId,
      },
      "Created activation nudge conversation(s) via poke"
    );

    if (created.length === 1) {
      return new Ok({
        display: "textWithLink",
        value: `Activation nudge conversation created for 1 pod member.`,
        link: `/poke/${workspace.sId}/conversation/${created[0].conversationId}`,
        linkText: "Open conversation in Poke",
      });
    }

    return new Ok({
      display: "text",
      value: `Created ${created.length} activation nudge conversation(s), one per pod member.`,
    });
  },
  isApplicableTo: (auth, pod) => (pod ? isActivationPod(auth, pod) : false),
});
