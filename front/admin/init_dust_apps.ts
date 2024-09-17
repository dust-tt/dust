import { WhitelistableFeature } from "@dust-tt/types";

import { Authenticator } from "@app/lib/auth";
import { FeatureFlag } from "@app/lib/models/feature_flag";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import {
  internalSubscribeWorkspaceToFreePlan,
  pokeUpgradeWorkspaceToPlan,
} from "@app/lib/plans/subscription";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

async function main() {
  let w = await Workspace.findOne({ where: { sId: "78bda07b39" } });
  if (w) {
    console.log(w.id);
    process.exit(0);
  }

  w = await Workspace.create({
    id: 5069,
    sId: "78bda07b39",
    name: "dust-apps",
  });

  const lightWorkspace = renderLightWorkspaceType({ workspace: w });

  const { systemGroup, globalGroup } =
    await GroupResource.makeDefaultsForWorkspace(lightWorkspace);

  const auth = await Authenticator.internalAdminForWorkspace(
    lightWorkspace.sId
  );
  await VaultResource.makeDefaultsForWorkspace(auth, {
    systemGroup,
    globalGroup,
  });

  const group = await GroupResource.makeNew({
    name: `Group for vault Public Dust Apps`,
    workspaceId: w.id,
    kind: "regular",
  });

  await VaultResource.makeNew(
    { id: 93077, name: "Public Dust Apps", kind: "public", workspaceId: w.id },
    group
  );

  await internalSubscribeWorkspaceToFreePlan({
    workspaceId: w.sId,
    planCode: "FREE_UPGRADED_PLAN",
  });

  await FeatureFlag.create({
    workspaceId: w.id,
    name: "private_data_vaults_feature",
  });

  await FeatureFlag.create({
    workspaceId: w.id,
    name: "data_vaults_feature",
  });

  const users = await User.findAll();
  await Promise.all(
    users.map(async (user) =>
      MembershipResource.createMembership({
        user: new UserResource(User, user.get()),
        workspace: lightWorkspace,
        role: "admin",
      })
    )
  );

  console.log(w.id);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
