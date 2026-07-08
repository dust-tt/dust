import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { DustFileSystem } from "@app/lib/api/file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import { createPlugin } from "@app/lib/api/poke/types";
import {
  getPodAgentsMdScopedPath,
  POD_AGENTS_MD_MAX_CHARACTER_COUNT,
} from "@app/lib/api/projects/constants";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { activationSkill } from "@app/lib/resources/skill/code_defined/global/activation";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { UserMessageContext } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const ACTIVATION_POD_NAME_PREFIX = "'s Activation Pod";

const joinActivationPodLogger = logger.child({
  activity: "join-activation-pod",
});

// Instruction the Dust agent receives to start the activation conversation.
// Hidden to the user.
const ACTIVATION_CONVERSATION_INITIAL_MESSAGE =
  "Welcome me to my new Pod and recommend the next best action to get more value from Dust.";

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

function parseUserIds(rawUserIds: string): string[] {
  const ids = rawUserIds
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  return [...new Set(ids)];
}

async function markPodAsActivation(
  auth: Authenticator,
  pod: SpaceResource
): Promise<Result<void, Error>> {
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (!metadata) {
    return new Err(
      new Error("Project metadata not found for the newly created pod.")
    );
  }

  await metadata.updateProvisioningSource("activation");

  return new Ok(undefined);
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
  await metadata.setDefaultSkills(auth, skills);

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

// Creates the Pod's first conversation.
async function createPodActivationConversation(
  podMemberAuth: Authenticator,
  pod: SpaceResource,
  creator: UserResource
): Promise<Result<{ conversationId: string }, Error>> {
  const conversation = await createConversation(podMemberAuth, {
    title: `Activation Conversation for ${pod.name}`,
    visibility: "unlisted",
    spaceId: pod.id,
  });

  // Enable the activation skill for the activation conversation.
  const [activationSkillResource] = await SkillResource.fetchByIds(
    podMemberAuth,
    [activationSkill.sId],
    { onlyActive: true }
  );
  if (!activationSkillResource) {
    return new Err(new Error("Activation skill not found."));
  }
  const pinResult = await SkillResource.upsertConversationSkills(
    podMemberAuth,
    {
      conversationId: conversation.id,
      skills: [activationSkillResource],
      enabled: true,
    }
  );
  if (pinResult.isErr()) {
    return new Err(pinResult.error);
  }

  const creatorJson = creator.toJSON();

  const context: UserMessageContext = {
    username: creatorJson.username,
    fullName: creatorJson.fullName,
    email: creatorJson.email,
    profilePictureUrl: creatorJson.image,
    timezone: "UTC",
    origin: "project_kickoff",
  };

  const postRes = await postUserMessage(podMemberAuth, {
    conversation,
    content: ACTIVATION_CONVERSATION_INITIAL_MESSAGE,
    mentions: [{ configurationId: GLOBAL_AGENTS_SID.DUST }],
    context,
    skipToolsValidation: false,
  });

  if (postRes.isErr()) {
    return new Err(new Error(postRes.error.api_error.message));
  }

  return new Ok({ conversationId: conversation.sId });
}

export const joinActivationPodPlugin = createPlugin({
  manifest: {
    id: "join-activation-pod",
    name: "Join Activation Pod",
    description:
      "Create an Activation Pod and add one or more workspace members to it as editors.",
    resourceTypes: ["workspaces"],
    args: {
      userIds: {
        type: "string",
        label: "User ID(s)",
        description:
          "Comma-separated sId(s) of the workspace member(s) to add to the " +
          "Activation Pod as members.",
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
    { userIds, defaultSkillIds, agentsMdInstructions }
  ) => {
    const requestedUserIds = parseUserIds(userIds);
    if (requestedUserIds.length === 0) {
      return new Err(new Error("At least one user ID is required."));
    }

    const selectedSkillIds = defaultSkillIds ?? [];
    const agentsMd = agentsMdInstructions ?? "";

    const workspace = auth.getNonNullableWorkspace();

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

    const [creator, ...otherUsers] = users;
    const podName = activationPodNameForCreator(creator, otherUsers);
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

    const activationResult = await markPodAsActivation(auth, pod);
    if (activationResult.isErr()) {
      return activationResult;
    }

    const skillsResult = await setPodDefaultSkills(auth, pod, selectedSkillIds);
    if (skillsResult.isErr()) {
      return skillsResult;
    }

    const agentsMdResult = await setPodAgentsMd(auth, pod, creator, agentsMd);
    if (agentsMdResult.isErr()) {
      return agentsMdResult;
    }

    const podMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
      creator.sId,
      workspace.sId
    );
    const kickoffResult = await createPodActivationConversation(
      podMemberAuth,
      pod,
      creator
    );
    if (kickoffResult.isErr()) {
      joinActivationPodLogger.error(
        {
          action: "join_activation_pod",
          spaceId: pod.sId,
          workspaceId: workspace.sId,
          error: kickoffResult.error.message,
        },
        "Failed to create Activation Pod kickoff conversation"
      );
    }

    joinActivationPodLogger.info(
      {
        action: "join_activation_pod",
        created: true,
        defaultSkills: skillsResult.value.skillNames,
        agentsMdWritten: agentsMdResult.value.written,
        kickoffConversationCreated: kickoffResult.isOk(),
        spaceId: pod.sId,
        userIds: users.map((u) => u.sId),
        workspaceId: workspace.sId,
      },
      "Created Activation Pod via poke"
    );

    return new Ok({
      display: "textWithLink",
      value:
        `Created Activation Pod with 1 editor and ${otherUsers.length} member(s).` +
        formatDefaultSkillsSuffix(skillsResult.value.skillNames) +
        formatAgentsMdSuffix(agentsMdResult.value.written),
      link: podLink(pod),
      linkText: "Open Pod in Poke",
    });
  },
});
