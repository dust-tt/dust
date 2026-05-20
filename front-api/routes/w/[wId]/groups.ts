import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupKind, GroupType } from "@app/types/groups";
import { GroupKindCodec } from "@app/types/groups";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type GetGroupsResponseBody = {
  groups: (GroupType & { memberCount: number })[];
};

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  spaceId: z.string().optional(),
});

// Mounted at /api/w/:wId/groups.
const app = new Hono();

app.get("/", validate("query", GetGroupsQuerySchema), async (c) => {
  const auth = c.get("auth");
  const { kind, spaceId } = c.req.valid("query");

  const groupKinds: GroupKind[] = kind
    ? Array.isArray(kind)
      ? kind
      : [kind]
    : ["global", "regular", "space_editors"];

  const groups: GroupResource[] = spaceId
    ? await GroupResource.listForSpaceById(auth, spaceId, { groupKinds })
    : await GroupResource.listAllWorkspaceGroups(auth, { groupKinds });

  const memberCounts = await GroupResource.getMemberCountsForGroups(
    auth,
    groups
  );

  const groupsWithMemberCount = groups.map((group) => ({
    ...group.toJSON(),
    memberCount: memberCounts.get(group.id) ?? 0,
  }));

  const body: GetGroupsResponseBody = { groups: groupsWithMemberCount };
  return c.json(body);
});

export default app;
