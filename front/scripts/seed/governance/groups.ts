import type { GroupResource } from "@app/lib/resources/group_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { SeedContext } from "@app/scripts/seed/factories";
import { seedGroup } from "@app/scripts/seed/factories";
import { removeNulls } from "@app/types/shared/utils/general";

export const DEV_TEAM_GROUP_NAME = "Dev team";
export const GO_TO_MARKET_GROUP_NAME = "Go To Market Team";
export const FRANCE_GROUP_NAME = "France";
export const LONG_NAME_GROUP_NAME =
  "test-group-with-very-long-name-to-see-how-it-displays-in-ui";

/**
 * Seeds the provisioned and manual groups the member panel and the groups tab display, so both
 * kinds of membership (and a name long enough to stress the UI) are covered. Returns the groups by
 * name.
 */
export async function seedGovernanceGroups(
  ctx: SeedContext,
  {
    alfred,
    bob,
    charly,
  }: {
    alfred: UserResource | undefined;
    bob: UserResource | undefined;
    charly: UserResource | undefined;
  }
): Promise<Map<string, GroupResource>> {
  const groupSpecs: {
    name: string;
    kind: "provisioned" | "regular_manual";
    members: UserResource[];
  }[] = [
    {
      name: DEV_TEAM_GROUP_NAME,
      kind: "provisioned",
      members: removeNulls([ctx.user, alfred]),
    },
    {
      name: GO_TO_MARKET_GROUP_NAME,
      kind: "provisioned",
      members: removeNulls([alfred, bob]),
    },
    {
      name: FRANCE_GROUP_NAME,
      kind: "regular_manual",
      members: removeNulls([ctx.user, charly]),
    },
    {
      name: LONG_NAME_GROUP_NAME,
      kind: "regular_manual",
      members: [ctx.user],
    },
  ];

  const groups = new Map<string, GroupResource>();
  for (const spec of groupSpecs) {
    const group = await seedGroup(ctx, spec);
    if (group) {
      groups.set(spec.name, group);
    }
  }

  return groups;
}
