import {
  createActivationTrigger,
  emitActivationEvent,
  getOrCreateActivationWebhookSourceView,
} from "@app/lib/api/activation/trigger";
import { DustFileSystem } from "@app/lib/api/file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { ActivationPodResource } from "@app/lib/resources/activation_pod_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { startActivationWorkspaceSchedule } from "@app/temporal/activation_scheduler/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const ACTIVATION_POD_NAME_PREFIX = "'s Activation Pod";

const joinActivationPodLogger = logger.child({
  activity: "join-activation-pod",
});

// Pod is named after the first user in the list. If there are multiple users
// with the same full name, named the pod after the first user's email.
function activationPodNameForCreator(
  creator: UserResource,
  otherUsers: UserResource[]
): string {
  const creatorFullName = creator.fullName();
  const hasNameCollision = otherUsers.some(
    (otherUser) => otherUser.fullName() === creatorFullName
  );

  const label = hasNameCollision ? creator.email : creatorFullName;
  return `${label}${ACTIVATION_POD_NAME_PREFIX}`;
}

async function setPodDefaultSkills(
  auth: Authenticator,
  pod: SpaceResource,
  selectedSkillIds: string[]
): Promise<Result<{ skillNames: string[] }, Error>> {
  // Always include the activation skill, deduped against the selection.
  const skillIds = [...new Set([activationSkill.sId, ...selectedSkillIds])];

  let metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (!metadata) {
    metadata = await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
    });
  }

  const skills = await SkillResource.fetchByIds(auth, skillIds, {
    onlyActive: true,
  });
  await metadata.setDefaultSkills(skills);

  return new Ok({ skillNames: skills.map((skill) => skill.name) });
}

function formatDefaultSkillsSuffix(skillNames: string[]): string {
  if (skillNames.length === 0) {
    return "";
  }
  return ` Set ${skillNames.length} default skill(s): ${skillNames.join(", ")}.`;
}

// Writes pod-wide agent instructions to the pod's AGENTS.md file.
async function setPodAgentsMd(
  auth: Authenticator,
  pod: SpaceResource,
  user: UserResource,
  instructions: string
): Promise<Result<{ written: boolean }, Error>> {
  const trimmed = instructions.trim();
  if (trimmed.length === 0) {
    return new Ok({ written: false });
  }

  if (trimmed.length > POD_AGENTS_MD_MAX_CHARACTER_COUNT) {
    return new Err(
      new Error(
        `AGENTS.md instructions exceed the ${POD_AGENTS_MD_MAX_CHARACTER_COUNT}-character limit.`
      )
    );
  }

  const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    auth.getNonNullableWorkspace().sId
  );

  const scopedPath = getPodAgentsMdScopedPath(pod.sId);
  const fsResult = await DustFileSystem.fromScopedPath(editorAuth, scopedPath);
  if (fsResult.isErr()) {
    return new Err(
      new Error(`Failed to open the Pod file system: ${fsResult.error.message}`)
    );
  }

  const writeResult = await writeCanonicalFileContent(
    editorAuth,
    fsResult.value,
    scopedPath,
    Buffer.from(trimmed, "utf8"),
    "text/markdown"
  );
  if (writeResult.isErr()) {
    return new Err(
      new Error(
        `Failed to write the Pod AGENTS.md: ${writeResult.error.message}`
      )
    );
  }

  return new Ok({ written: true });
}

function formatAgentsMdSuffix(written: boolean): string {
  return written ? " Saved AGENTS.md instructions." : "";
}

export const joinActivationPodPlugin = createPlugin({
  manifest: {
    id: "join-activation-pod",
    name: "Join Activation Pod",
    description:
      "Create an Activation Pod with a chosen editor and optional additional members.",
    resourceTypes: ["workspaces"],
    args: {
      editorUserId: {
        type: "enum",
        label: "Pod editor",
        description:
          "Search by name or email. This member becomes the Pod editor, and " +
          "the Pod is named after them by default.",
        // Options are loaded from the workspace member search API as the user
        // types; no static values are needed.
        async: true,
        values: [],
        multiple: false,
        serverSideSearch: true,
      },
      memberUserIds: {
        type: "enum",
        label: "Additional members",
        description:
          "Optional. Search and select more workspace members to add to the " +
          "Activation Pod as members.",
        async: true,
        values: [],
        multiple: true,
        serverSideSearch: true,
      },
      podName: {
        type: "string",
        label: "Pod name",
        description:
          "Optional. Name for the Activation Pod. Defaults to " +
          `"<creator>${ACTIVATION_POD_NAME_PREFIX}" if left blank.`,
      },
      defaultSkillIds: {
        type: "enum",
        label: "Default skills",
        description:
          "Optional. Select workspace skills to add as default skills for the Activation Pod.",
        async: true,
        values: [],
        multiple: true,
      },
      agentsMdInstructions: {
        type: "text",
        label: "AGENTS.md instructions",
        description:
          "Optional. Pod-wide instructions saved to the Pod's AGENTS.md file and followed by all " +
          `agents in the Pod. Max ${POD_AGENTS_MD_MAX_CHARACTER_COUNT} characters.`,
      },
    },
    requiredRoles: ["support"],
  },
  populateAsyncArgs: async (auth) => {
    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
      globalSpaceOnly: true,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });

    return new Ok({
      defaultSkillIds: skills
        .map((skill) => ({
          label: skill.name,
          value: skill.sId,
          checked: false,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    });
  },
  execute: async (
    auth,
    _resource,
    {
      editorUserId,
      memberUserIds,
      podName: podNameInput,
      defaultSkillIds,
      agentsMdInstructions,
    }
  ) => {
    const editorId = editorUserId?.[0]?.trim();
    if (!editorId) {
      return new Err(new Error("A Pod editor is required."));
    }

    // Additional members, deduped and never including the editor (who is added
    // separately as the Pod creator/editor).
    const memberIds = [
      ...new Set(
        (memberUserIds ?? [])
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== editorId)
      ),
    ];

    const selectedSkillIds = defaultSkillIds ?? [];
    const agentsMd = agentsMdInstructions ?? "";

    const workspace = auth.getNonNullableWorkspace();

    const requestedUserIds = [editorId, ...memberIds];
    const users = await UserResource.fetchByIds(requestedUserIds);
    const foundUserIds = new Set(users.map((u) => u.sId));
    const missingUserIds = requestedUserIds.filter(
      (id) => !foundUserIds.has(id)
    );
    if (missingUserIds.length > 0) {
      return new Err(
        new Error(`No user(s) found with ID(s): ${missingUserIds.join(", ")}.`)
      );
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      users,
      workspace,
    });
    const activeUserModelIds = new Set(memberships.map((m) => m.userId));
    const nonMembers = users.filter((u) => !activeUserModelIds.has(u.id));
    if (nonMembers.length > 0) {
      return new Err(
        new Error(
          "User(s) not active member(s) of this workspace: " +
            `${nonMembers.map((u) => u.sId).join(", ")}.`
        )
      );
    }

    // The editor is the Pod creator (added as editor on creation and used for
    // naming); everyone else is added as a member.
    const creator = users.find((u) => u.sId === editorId);
    if (!creator) {
      return new Err(new Error(`Pod editor not found: ${editorId}.`));
    }
    const otherUsers = users.filter((u) => u.sId !== editorId);
    const trimmedPodName = podNameInput?.trim();
    const podName =
      trimmedPodName && trimmedPodName.length > 0
        ? trimmedPodName
        : activationPodNameForCreator(creator, otherUsers);
    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    // The first user is added as an editor on creation and the remaining users as members.
    const creatorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      creator.sId,
      workspace.sId
    );
    const createResult = await createSpaceAndGroup(creatorAuth, {
      name: podName,
      isRestricted: true,
      spaceKind: "project",
      managementMode: "manual",
      memberIds: [],
    });

    if (createResult.isErr()) {
      return new Err(new Error(createResult.error.message));
    }
    const pod = createResult.value;

    if (otherUsers.length > 0) {
      const membersResult = await pod.addMembers(auth, {
        userIds: otherUsers.map((u) => u.sId),
      });
      if (membersResult.isErr()) {
        return new Err(
          new Error(
            `Failed to add users as members of the pod: ${membersResult.error.message}`
          )
        );
      }
    }

    // Star the pod for every member so it surfaces in their sidebar.
    await UserProjectPreferencesResource.setStarredForUsers(auth, {
      spaceModelId: pod.id,
      userModelIds: users.map((u) => u.id),
      isStarred: true,
    });

    const skillsResult = await setPodDefaultSkills(auth, pod, selectedSkillIds);
    if (skillsResult.isErr()) {
      return skillsResult;
    }

    const agentsMdResult = await setPodAgentsMd(auth, pod, creator, agentsMd);
    if (agentsMdResult.isErr()) {
      return agentsMdResult;
    }

    // Provision the shared activation webhook and create the user-owned trigger
    // that fires the activation conversation.
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const podMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      creator.sId,
      workspace.sId
    );

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

    const triggerResult = await createActivationTrigger(podMemberAuth, {
      pod,
      creator,
      podView: podViewResult.value,
    });
    if (triggerResult.isErr()) {
      return new Err(
        new Error(
          `Failed to create Activation Pod trigger: ${triggerResult.error.message}`
        )
      );
    }

    // Record the canonical ActivationPod row now that the pod's owner and
    // trigger are known. This is the record `isEligibleForNudge` and the
    // activation scheduler use to find the pod and its trigger, so it must
    // be created for the pod to ever be nudged.
    const activationTrigger = await TriggerResource.fetchById(
      podMemberAuth,
      triggerResult.value.triggerId
    );
    await ActivationPodResource.makeNew(auth, {
      pod,
      user: creator,
      trigger: activationTrigger,
    });

    // Fire the activation event so the trigger kicks off the initial conversation
    // as soon as the pod is provisioned.
    const emitResult = await emitActivationEvent(adminAuth, pod, creator.sId);
    if (emitResult.isErr()) {
      return new Err(
        new Error(
          `Failed to emit Activation Pod event: ${emitResult.error.message}`
        )
      );
    }

    // Ensure the workspace has a running Activation schedule now that it has
    // a pod to nudge: idempotent (a no-op if one already exists), so this
    // runs unconditionally rather than only on the workspace's first pod.
    const scheduleResult = await startActivationWorkspaceSchedule({
      workspaceId: workspace.sId,
    });
    if (scheduleResult.isErr()) {
      return new Err(
        new Error(
          `Failed to start the Activation Pod schedule: ${scheduleResult.error.message}`
        )
      );
    }

    joinActivationPodLogger.info(
      {
        action: "join_activation_pod",
        created: true,
        defaultSkills: skillsResult.value.skillNames,
        agentsMdWritten: agentsMdResult.value.written,
        spaceId: pod.sId,
        userIds: users.map((u) => u.sId),
        workspaceId: workspace.sId,
      },
      "Created Activation Pod via poke"
    );

    return new Ok({
      display: "textWithLink",
      value:
        `Created Activation Pod "${podName}" with ${creator.fullName()} as editor ` +
        `and ${otherUsers.length} additional member(s).` +
        formatDefaultSkillsSuffix(skillsResult.value.skillNames) +
        formatAgentsMdSuffix(agentsMdResult.value.written) +
        " Triggered the activation conversation.",
      link: podLink(pod),
      linkText: "Open Pod in Poke",
    });
  },
});
