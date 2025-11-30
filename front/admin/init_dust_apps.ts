import parseArgs from "minimist";

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { isDevelopment, SPACE_GROUP_PREFIX } from "@app/types";

const DEFAULT_WORKSPACE_NAME = "dust-apps";
const DEFAULT_SPACE_NAME = "Public Dust Apps";

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  let w: WorkspaceResource | null;
  if (argv.sId) {
    w = await WorkspaceResource.fetchById(argv.sId);
  } else if (argv.name) {
    w = await WorkspaceResource.fetchByName(argv.name);
  } else {
    throw new Error("Please provide the name or sId for the workspace");
  }

  if (!w) {
    console.log("Creating workspace");
    w = await WorkspaceResource.makeNew({
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      sId: argv.sId || generateRandomModelSId(),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      name: argv.name || DEFAULT_WORKSPACE_NAME,
    });

    await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
      workspaceId: w.sId,
      planCode: "FREE_UPGRADED_PLAN",
      endDate: null,
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
  let space = spaces.find((s) => s.isPublic());
  if (!space) {
    console.log("Creating group");
    const group = await GroupResource.makeNew({
      name: `${SPACE_GROUP_PREFIX} ${DEFAULT_SPACE_NAME}`,
      workspaceId: w.id,
      kind: "regular",
    });

    if (isDevelopment()) {
      const users = await UserModel.findAll();
      await concurrentExecutor(
        users,
        async (user) =>
          MembershipResource.createMembership({
            user: new UserResource(UserModel, user.get()),
            workspace: lightWorkspace,
            role: "admin",
            origin: "invited",
          }),
        { concurrency: 5 }
      );
    }

    console.log("Creating space");
    space = await SpaceResource.makeNew(
      { name: DEFAULT_SPACE_NAME, kind: "public", workspaceId: w.id },
      [group]
    );
  }

  console.log(`export DUST_APPS_WORKSPACE_ID=${w.sId}`);
  console.log(`export DUST_APPS_SPACE_ID=${space.sId}`);
  console.log(`---`);
  console.log(`- Restart front with the new env variables`);
  console.log(
    `- Navigate to: http://localhost:3000/poke/${w.sId}/spaces/${space.sId}`
  );
  console.log(`- Run the "Sync dust-apps" plugin`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
