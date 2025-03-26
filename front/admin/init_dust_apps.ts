import _ from "lodash";
import parseArgs from "minimist";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { concurrentExecutor, isDevelopment } from "@app/types";

const DEFAULT_WORKSPACE_NAME = "dust-apps";
const DEFAULT_SPACE_NAME = "Public Dust Apps";

async function main() {
  const argv = parseArgs(process.argv.slice(2));

  const where = _.pick(argv, ["name", "sId"]);
  if (!where.name && !where.sId) {
    throw new Error("Please provide name and/or sId for the workspace");
  }
  let w = await Workspace.findOne({ where });
  if (!w) {
    console.log("Creating workspace");
    w = await Workspace.create({
      sId: argv.sId || generateRandomModelSId(),
      name: argv.name || DEFAULT_WORKSPACE_NAME,
    });

    await SubscriptionResource.internalSubscribeWorkspaceToFreePlan({
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
  let space = spaces.find((s) => s.isPublic());
  if (!space) {
    console.log("Creating group");
    const group = await GroupResource.makeNew({
      name: `Group for space ${DEFAULT_SPACE_NAME}`,
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
