import { listUsersWithoutAccessToSpaceResources } from "@app/lib/api/spaces/access";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { extractUniqueSkillReferenceIds } from "@app/lib/skills/format";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import uniq from "lodash/uniq";

export async function resolveAdditionalRequestedSpaceModelIds(
  auth: Authenticator,
  additionalRequestedSpaceIds: string[] | undefined
): Promise<Result<ModelId[], Error>> {
  const requestedSpaceIds = uniq(additionalRequestedSpaceIds ?? []);

  if (requestedSpaceIds.length === 0) {
    return new Ok([]);
  }

  const spaces = await SpaceResource.fetchByIds(auth, requestedSpaceIds);
  const readableSpacesById = new Map(
    spaces
      .filter((space) => auth.can("read", space))
      .map((space) => [space.sId, space])
  );

  const inaccessibleSpaceIds = requestedSpaceIds.filter(
    (spaceId) => !readableSpacesById.has(spaceId)
  );

  if (inaccessibleSpaceIds.length > 0) {
    return new Err(
      new Error(
        `User does not have access to the following spaces: ${inaccessibleSpaceIds.join(", ")}`
      )
    );
  }

  const additionalRequestedSpaceModelIds: ModelId[] = [];
  for (const spaceId of requestedSpaceIds) {
    const space = readableSpacesById.get(spaceId);
    if (space) {
      additionalRequestedSpaceModelIds.push(space.id);
    }
  }

  return new Ok(additionalRequestedSpaceModelIds);
}

/**
 * Checks that every editor can read every restricted space the skill requires, and describes the
 * ones that cannot.
 *
 * A skill is only usable by someone who can read all of its requested spaces, so an editor without
 * that access cannot open the skill they are supposed to maintain. Both sides can drift into that
 * state — adding a restricted space to the skill, or adding an editor — so both write paths call
 * this. Non-restricted spaces are readable workspace-wide and never constrain anyone.
 *
 * Returns `null` when every editor is fine, or a human-readable explanation naming who is missing
 * what. Callers turn that into their own error shape.
 */
export async function findSkillEditorsWithoutSpaceAccess(
  auth: Authenticator,
  {
    editors,
    requestedSpaces,
  }: { editors: UserResource[]; requestedSpaces: SpaceResource[] }
): Promise<string | null> {
  if (editors.length === 0 || requestedSpaces.length === 0) {
    return null;
  }

  const openIds = await SpaceResource.listOpenSpaceModelIds(
    auth,
    requestedSpaces
  );
  const restrictedSpaces = requestedSpaces.filter(
    (space) =>
      (space.isRegular() || space.isProject()) && !openIds.has(space.id)
  );

  const editorsWithoutAccess = await listUsersWithoutAccessToSpaceResources(
    auth,
    { spaces: restrictedSpaces, users: editors }
  );

  if (editorsWithoutAccess.length === 0) {
    return null;
  }

  const details = editorsWithoutAccess
    .map(
      ({ user, spaces: missingSpaces }) =>
        `${user.fullName()} (${missingSpaces.map((space) => space.name).join(", ")})`
    )
    .join("; ");

  return (
    `Some editors do not have access to the spaces this skill requires: ${details}. ` +
    `Add them to those spaces, remove the spaces from the skill, or remove them from the editors.`
  );
}

export async function getReferencedSkillSpaceModelIds(
  auth: Authenticator,
  instructions: string,
  excludedSkillId?: string
): Promise<ModelId[]> {
  const referencedSkillIds = extractUniqueSkillReferenceIds(
    instructions
  ).filter((skillId) => skillId !== excludedSkillId);

  if (referencedSkillIds.length === 0) {
    return [];
  }

  // fetchByIds applies skill visibility. Unreadable references stay unavailable
  // during tag normalization instead of silently expanding the parent skill.
  const referencedSkills = await SkillResource.fetchByIds(
    auth,
    referencedSkillIds
  );

  return uniq(
    referencedSkills
      .filter((skill) => skill.status === "active")
      .flatMap((skill) => skill.requestedSpaceIds)
  );
}
