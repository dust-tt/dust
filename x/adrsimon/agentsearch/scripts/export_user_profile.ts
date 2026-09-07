import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import * as fs from "fs";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    email: {
      type: "string",
      demandOption: true,
      description: "Email of the user to snapshot",
    },
    outputFile: {
      type: "string",
      description: "Output path (defaults to ./profile_<userSId>.json)",
    },
  },
  async ({ wId, email, outputFile }, logger) => {
    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      throw new Error(`Workspace ${wId} not found.`);
    }

    const user = await UserResource.fetchByEmail(email);
    if (!user) {
      throw new Error(`User ${email} not found.`);
    }

    const auth = await Authenticator.fromUserIdAndWorkspaceId(user.sId, wId);
    if (auth.role() === "none") {
      throw new Error(`User ${email} is not a member of workspace ${wId}.`);
    }

    const groups = await GroupResource.listUserGroupsInWorkspace({
      user,
      workspace: auth.getNonNullableWorkspace(),
    });

    const spaces = await SpaceResource.listWorkspaceSpaces(auth, {
      includeConversationsSpace: true,
      includeProjectSpaces: true,
    });
    const readableSpaces = spaces.filter((space) => space.canRead(auth));

    const toSpace = (space: (typeof readableSpaces)[number]) => ({
      sId: space.sId,
      name: space.name,
      kind: space.kind,
    });

    const profile = {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      generatedAt: new Date().toISOString(),
      user: {
        sId: user.sId,
        email: user.email,
        fullName: user.fullName(),
      },
      role: auth.role(),
      groupIds: groups.map((group) => group.sId),
      groups: groups.map((group) => ({
        sId: group.sId,
        name: group.name,
        kind: group.kind,
      })),
      readableNonPodSpaces: readableSpaces
        .filter((space) => !space.isProject())
        .map(toSpace),
      readablePodSpaces: readableSpaces
        .filter((space) => space.isProject())
        .map(toSpace),
    };

    const path = outputFile ?? `./profile_${user.sId}.json`;
    await fs.promises.writeFile(
      path,
      JSON.stringify(profile, null, 2),
      "utf-8"
    );

    logger.info(
      {
        path,
        groupCount: profile.groups.length,
        readableSpaceCount: readableSpaces.length,
        readablePodSpaceCount: profile.readablePodSpaces.length,
      },
      "Profile exported"
    );
  }
);
