import { createPlugin } from "@app/lib/api/poke/types";
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

const ACTIVATION_POD_NAME_PREFIX = "Activation Pod - ";

const joinActivationPodLogger = logger.child({
  activity: "join-activation-pod",
});

function activationPodNameForEmail(email: string): string {
  return `${ACTIVATION_POD_NAME_PREFIX}${email}`;
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

export const joinActivationPodPlugin = createPlugin({
  manifest: {
    id: "join-activation-pod",
    name: "Join Activation Pod",
    description:
      "Create a personal activation Pod for a workspace member and invite them to it.",
    resourceTypes: ["workspaces"],
    args: {
      userEmail: {
        type: "string",
        label: "User email",
        description:
          "Email of the workspace member to provision an activation Pod for.",
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
  execute: async (auth, _resource, { userEmail, defaultSkillIds }) => {
    const email = userEmail.trim().toLowerCase();
    if (email.length === 0) {
      return new Err(new Error("A user email is required."));
    }

    const selectedSkillIds = defaultSkillIds ?? [];

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
        new Error(
          `User "${user.username}" is not an active member of this workspace.`
        )
      );
    }

    const podName = activationPodNameForEmail(user.email);
    const podLink = (space: SpaceResource) =>
      `/poke/${workspace.sId}/spaces/${space.sId}`;

    // If the activation pod already exists, return it (after making sure the user is invited).
    const existingPods = await SpaceResource.listProjectSpaces(auth);
    const existingPod = existingPods.find((space) => space.name === podName);
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

      joinActivationPodLogger.info(
        {
          action: "join_activation_pod",
          created: false,
          addedAsEditor: editorResult.value.added,
          defaultSkills: skillsResult.value.skillNames,
          spaceId: existingPod.sId,
          userId: user.sId,
          workspaceId: workspace.sId,
        },
        "Returned existing activation pod via poke"
      );

      return new Ok({
        display: "textWithLink",
        value:
          `Activation Pod already exists for ${user.username}. ` +
          (editorResult.value.added
            ? "The user was missing and has been added as an editor."
            : "The user is already an editor.") +
          formatDefaultSkillsSuffix(skillsResult.value.skillNames),
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

    const skillsResult = await setPodDefaultSkills(auth, pod, selectedSkillIds);
    if (skillsResult.isErr()) {
      return skillsResult;
    }

    joinActivationPodLogger.info(
      {
        action: "join_activation_pod",
        created: true,
        defaultSkills: skillsResult.value.skillNames,
        spaceId: pod.sId,
        userId: user.sId,
        workspaceId: workspace.sId,
      },
      "Created activation pod via poke"
    );

    return new Ok({
      display: "textWithLink",
      value:
        `Created activation Pod for ${user.username} and added them as an editor.` +
        formatDefaultSkillsSuffix(skillsResult.value.skillNames),
      link: podLink(pod),
      linkText: "Open Pod in Poke",
    });
  },
});
