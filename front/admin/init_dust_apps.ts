import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { internalSubscribeWorkspaceToFreePlan } from "@app/lib/plans/subscription";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

async function main() {
  let w = await Workspace.findOne({ where: { name: "dust-apps" } });
  if (!w) {
    console.log("Creating workspace");
    w = await Workspace.create({
      sId: generateRandomModelSId(),
      name: "dust-apps",
    });

    await internalSubscribeWorkspaceToFreePlan({
      workspaceId: w.sId,
      planCode: "FREE_UPGRADED_PLAN",
    });
  }
  const lightWorkspace = renderLightWorkspaceType({ workspace: w });

  const { systemGroup, globalGroup } =
    await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

  const auth = await Authenticator.internalAdminForWorkspace(
    lightWorkspace.sId
  );
  await SpaceResource.makeDefaultsForWorkspace(auth, {
    systemGroup,
    globalGroup,
  });

  const spaces = await SpaceResource.listWorkspaceSpaces(auth);
  let space = spaces.find((s) => s.name === "Public Dust Apps");
  if (!space) {
    console.log("Creating group");
    const group = await GroupResource.makeNew({
      name: `Group for space Public Dust Apps`,
      workspaceId: w.id,
      kind: "regular",
    });

    const users = await UserModel.findAll();
    await Promise.all(
      users.map(async (user) =>
        MembershipResource.createMembership({
          user: new UserResource(UserModel, user.get()),
          workspace: lightWorkspace,
          role: "admin",
        })
      )
    );

    console.log("Creating space");
    space = await SpaceResource.makeNew(
      { name: "Public Dust Apps", kind: "public", workspaceId: w.id },
      [group]
    );
  }

  console.log(`export DUST_APPS_WORKSPACE_ID=${w.sId}`);
  console.log(`export DUST_APPS_SPACE_ID=${space.sId}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
