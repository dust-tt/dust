import { GroupResource } from "@app/lib/resources/group_resource";
import type { GroupKind, GroupType } from "@app/types/groups";
import { GroupKindCodec } from "@app/types/groups";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type GetGroupsResponseBody = {
  groups: (GroupType & { memberCount: number })[];
};

const GetGroupsQuerySchema = z.object({
  kind: z.union([GroupKindCodec, z.array(GroupKindCodec)]).optional(),
  spaceId: z.string().optional(),
});

// Mounted at /api/w/:wId/groups.
const app = workspaceApp();

app.get(
  "/",
  validate("query", GetGroupsQuerySchema),
  async (ctx): HandlerResult<GetGroupsResponseBody> => {
    const auth = ctx.get("auth");
    const { kind, spaceId } = ctx.req.valid("query");

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

    return ctx.json({ groups: groupsWithMemberCount });
  }
);

export default app;
