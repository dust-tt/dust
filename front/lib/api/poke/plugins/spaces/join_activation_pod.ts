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
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const ACTIVATION_POD_NAME_PREFIX = "'s Activation Pod";

const joinActivationPodLogger = logger.child({
  activity: "join-activation-pod",
});

function activationPodNameForUser(
  firstName: string,
  lastName: string | null
): string {
  const fullName = [firstName, lastName].filter(Boolean).join(" ");
  return `${fullName}${ACTIVATION_POD_NAME_PREFIX}`;
}

// Adds the user to the pod as an editor.
async function addUserAsEditor(
  auth: Authenticator,
  pod: SpaceResource,
  user: UserResource
): Promise<Result<{ added: boolean }, Error>> {
  const res = await pod.addEditors(auth, { userIds: [user.sId] });
  if (res.isErr()) {
    return new Err(
      new Error(
        `Failed to add the user as an editor of the pod: ${res.error.message}`
      )
    );
  }

  return new Ok({ added: res.value.length > 0 });
}

// Select the pod's default skills.
async function setPodDefaultSkills(
  auth: Authenticator,
  pod: SpaceResource,
  selectedSkillIds: string[]
): Promise<Result<{ skillNames: string[] }, Error>> {
  if (selectedSkillIds.length === 0) {
    return new Ok({ skillNames: [] });
  }

  let metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (!metadata) {
    metadata = await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
    });
  }

  const skills = await SkillResource.fetchByIds(auth, selectedSkillIds, {
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

// Record user's email in project_metadata to check for idempotency.
async function recordActivationPodMemberEmail(
  auth: Authenticator,
  pod: SpaceResource,
  email: string
): Promise<void> {
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
  if (metadata) {
    await metadata.updateActivationPodMemberEmail(email);
  } else {
    await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
      activationPodMemberEmail: email,
    });
  }
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
      "Create a personal Activation Pod for a workspace member and invite them to it.",
    resourceTypes: ["workspaces"],
    args: {
      userEmail: {
        type: "string",
        label: "User email",
        description:
          "Email of the workspace member to provision an Activation Pod for.",
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
    { userEmail, defaultSkillIds, agentsMdInstructions }
  ) => {
    const email = userEmail.trim().toLowerCase();
    if (email.length === 0) {
      return new Err(new Error("A user email is required."));
    }

    const selectedSkillIds = defaultSkillIds ?? [];
    const agentsMd = agentsMdInstructions ?? "";

    const workspace = auth.getNonNullableWorkspace();

    const user = await UserResource.fetchByEmail(email);
    if (!user) {
      return new Err(new Error(`No user found with email "${email}".`));
    }

    const membership =
      await MembershipResource.getActiveMembershipOfUserInWorkspace({
        user,
        workspace,
      });
    if (!membership) {
      return new Err(
        new Error(`"${email}" is not an active member of this workspace.`)
      );
    }

    const podName = activationPodNameForUser(user.firstName, user.lastName);
    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    const existingMetadata =
      await ProjectMetadataResource.fetchByActivationPodMemberEmail(
        auth,
        user.email
      );
    const existingPod = existingMetadata
      ? ((
          await SpaceResource.fetchByModelIds(auth, [existingMetadata.spaceId])
        )[0] ?? null)
      : null;
    if (existingPod) {
      const editorResult = await addUserAsEditor(auth, existingPod, user);
      if (editorResult.isErr()) {
        return editorResult;
      }

      const skillsResult = await setPodDefaultSkills(
        auth,
        existingPod,
        selectedSkillIds
      );
      if (skillsResult.isErr()) {
        return skillsResult;
      }

      const agentsMdResult = await setPodAgentsMd(
        auth,
        existingPod,
        user,
        agentsMd
      );
      if (agentsMdResult.isErr()) {
        return agentsMdResult;
      }

      joinActivationPodLogger.info(
        {
          action: "join_activation_pod",
          created: false,
          addedAsEditor: editorResult.value.added,
          defaultSkills: skillsResult.value.skillNames,
          agentsMdWritten: agentsMdResult.value.written,
          spaceId: existingPod.sId,
          userId: user.sId,
          workspaceId: workspace.sId,
        },
        "Returned existing Activation Pod via poke"
      );

      return new Ok({
        display: "textWithLink",
        value:
          `Activation Pod already exists for ${email}. ` +
          (editorResult.value.added
            ? "The user was missing and has been added as an editor."
            : "The user is already an editor.") +
          formatDefaultSkillsSuffix(skillsResult.value.skillNames) +
          formatAgentsMdSuffix(agentsMdResult.value.written),
        link: podLink(existingPod),
        linkText: "Open Pod in Poke",
      });
    }

    const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const createResult = await createSpaceAndGroup(userAuth, {
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

    await recordActivationPodMemberEmail(auth, pod, user.email);

    const skillsResult = await setPodDefaultSkills(auth, pod, selectedSkillIds);
    if (skillsResult.isErr()) {
      return skillsResult;
    }

    const agentsMdResult = await setPodAgentsMd(auth, pod, user, agentsMd);
    if (agentsMdResult.isErr()) {
      return agentsMdResult;
    }

    joinActivationPodLogger.info(
      {
        action: "join_activation_pod",
        created: true,
        defaultSkills: skillsResult.value.skillNames,
        agentsMdWritten: agentsMdResult.value.written,
        spaceId: pod.sId,
        userId: user.sId,
        workspaceId: workspace.sId,
      },
      "Created Activation Pod via poke"
    );

    return new Ok({
      display: "textWithLink",
      value:
        `Created Activation Pod for ${email} and added them as an editor.` +
        formatDefaultSkillsSuffix(skillsResult.value.skillNames) +
        formatAgentsMdSuffix(agentsMdResult.value.written),
      link: podLink(pod),
      linkText: "Open Pod in Poke",
    });
  },
});
