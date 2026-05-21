import { getMembers } from "@app/lib/api/workspace";
import { spaceToPokeJSON } from "@app/lib/poke/utils";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { PokeSpaceType } from "@app/types/poke";
import type { ProjectMetadataType } from "@app/types/project_metadata";
import type { UserTypeWithWorkspaces } from "@app/types/user";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type PokeGetSpaceDetails = {
  members: Record<string, UserTypeWithWorkspaces[]>;
  metadata: ProjectMetadataType | null;
  space: PokeSpaceType;
};

// Mounted at /api/poke/workspaces/:wId/spaces/:spaceId/details.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeGetSpaceDetails> => {
  const auth = ctx.get("auth");
  const spaceId = ctx.req.param("spaceId") ?? "";

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  }

  const members: Record<string, UserTypeWithWorkspaces[]> = {};

  const allGroups = space.groups.filter((g) =>
    space.managementMode === "manual"
      ? g.kind === "regular" || g.kind === "space_editors"
      : g.kind === "provisioned"
  );

  const memberships = await getMembers(auth);
  const memberById = new Map(memberships.members.map((m) => [m.sId, m]));

  for (const group of allGroups) {
    const groupMembers = await group.getActiveMembers(auth);
    members[group.name] = groupMembers.flatMap((user) => {
      const member = memberById.get(user.sId);
      return member ? [member] : [];
    });
  }

  const metadata = space.isProject()
    ? await ProjectMetadataResource.fetchBySpace(auth, space)
    : null;

  return ctx.json({
    members,
    metadata: metadata ? metadata.toJSON() : null,
    space: spaceToPokeJSON(space),
  });
});

export default app;
