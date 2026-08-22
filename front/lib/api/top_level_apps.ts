import { createConversation } from "@app/lib/api/assistant/conversation";
import { listNonArchivedMemberSpacesWithMetadata } from "@app/lib/api/projects/list";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { TopLevelAppType } from "@app/types/api/top_level_apps";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * An App is a Pod carrying `isApp`. Creation therefore reuses Pod creation wholesale and only adds
 * the two things that make it an App: the flag, and the conversation the builder resumes forever.
 */

const DEFAULT_APP_NAME = "Untitled App";

/** Enough to outrun any realistic number of unnamed Apps in one workspace. */
const MAX_NAME_ATTEMPTS = 100;

/**
 * App creation reuses Pod creation, so its failures are Pod failures. Only the three a caller can
 * act on differently are kept; the rest (an auto-generated name colliding, a malformed request the
 * client cannot have sent) are genuine internal errors.
 */
export type AppErrorCode = "internal_error" | "limit_reached" | "unauthorized";

/**
 * Pod names are unique per workspace, so an auto-named App needs a free one: `Untitled App`, then
 * `Untitled App 2`, and so on.
 */
async function findAvailableAppName(
  auth: Authenticator
): Promise<Result<string, DustError<AppErrorCode>>> {
  for (let attempt = 1; attempt <= MAX_NAME_ATTEMPTS; attempt++) {
    const candidate =
      attempt === 1 ? DEFAULT_APP_NAME : `${DEFAULT_APP_NAME} ${attempt}`;
    if (await SpaceResource.isNameAvailable(auth, candidate)) {
      return new Ok(candidate);
    }
  }

  return new Err(
    new DustError(
      "internal_error",
      "Could not find an available name for the new App."
    )
  );
}

/**
 * Creates an App: a restricted Pod, flagged as an App, with the empty conversation the builder
 * posts the user's first prompt into. The prompt itself is posted by the client, so the streaming
 * and attachment handling of the normal message path is reused untouched.
 */
export async function createApp(
  auth: Authenticator
): Promise<Result<TopLevelAppType, DustError<AppErrorCode>>> {
  const nameRes = await findAvailableAppName(auth);
  if (nameRes.isErr()) {
    return nameRes;
  }
  const name = nameRes.value;

  const spaceRes = await createSpaceAndGroup(auth, {
    name,
    isRestricted: true,
    spaceKind: "project",
    managementMode: "manual",
    memberIds: [],
  });
  if (spaceRes.isErr()) {
    switch (spaceRes.error.code) {
      case "limit_reached":
      case "unauthorized":
        return new Err(
          new DustError(spaceRes.error.code, spaceRes.error.message)
        );
      default:
        return new Err(new DustError("internal_error", spaceRes.error.message));
    }
  }
  const space = spaceRes.value;

  // `createSpaceAndGroup` already created the metadata row for a project space.
  const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
  if (!metadata) {
    return new Err(
      new DustError("internal_error", "The App metadata is missing.")
    );
  }

  const conversation = await createConversation(auth, {
    title: name,
    visibility: "unlisted",
    spaceId: space.id,
  });

  await metadata.markAsApp({ appConversationId: conversation.sId });

  return new Ok({
    sId: space.sId,
    name: space.name,
    appConversationId: conversation.sId,
    updatedAt: space.updatedAt.getTime(),
  });
}

/** The workspace member's Apps, newest activity first. Backs the sidebar's Apps section. */
export async function listApps(
  auth: Authenticator
): Promise<TopLevelAppType[]> {
  const { nonArchivedSpaces, metadataMap } =
    await listNonArchivedMemberSpacesWithMetadata(auth);

  const apps = [];
  for (const space of nonArchivedSpaces) {
    const metadata = metadataMap.get(space.id);
    if (!metadata?.isApp) {
      continue;
    }
    apps.push({
      sId: space.sId,
      name: space.name,
      appConversationId: metadata.appConversationId,
      updatedAt: space.updatedAt.getTime(),
    });
  }

  return apps.sort((a, b) => b.updatedAt - a.updatedAt);
}
