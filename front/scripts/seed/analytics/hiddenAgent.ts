import { DROID_AVATAR_URLS } from "@app/components/agent_builder/settings/avatar_picker/types";
import {
  createAgentConfiguration,
  searchAgentConfigurationsByName,
} from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { CreatedAgent, SeedContext } from "@app/scripts/seed/factories";
import { SPACE_GROUP_PREFIX } from "@app/types/groups";

const AGENT_NAME = "SeedPrivateAgent";
const SPACE_NAME = "Analytics Restricted Space";

async function findOrCreateRestrictedSpace(
  ctx: SeedContext,
  internalAuth: Authenticator,
  owner: UserResource
): Promise<SpaceResource> {
  const { workspace, logger } = ctx;

  const existingSpaces = await SpaceResource.listWorkspaceSpaces(internalAuth);
  const existingSpace = existingSpaces.find(
    (space) => space.name === SPACE_NAME
  );
  if (existingSpace) {
    return existingSpace;
  }

  const spaceGroup = await GroupResource.makeNew({
    name: `${SPACE_GROUP_PREFIX} ${SPACE_NAME}`,
    workspaceId: workspace.id,
    kind: "regular_auto",
  });
  const space = await SpaceResource.makeNew(
    { name: SPACE_NAME, kind: "regular", workspaceId: workspace.id },
    { members: [spaceGroup] }
  );
  // Adding space members requires administrate rights, which the owner (role
  // "user") does not have.
  const addMembersResult = await space.addMembers(internalAuth, {
    userIds: [owner.sId],
  });
  if (addMembersResult.isErr()) {
    throw addMembersResult.error;
  }

  logger.info({ sId: space.sId, name: SPACE_NAME }, "Restricted space created");
  return space;
}

/**
 * Seeds an agent the workspace admin is not supposed to see anywhere else:
 * `hidden` scope (so it is unpublished), owned by another user (so the admin is
 * not an editor), and built on a restricted space the admin is not a member of
 * (so space permissions filter it out too).
 *
 * Its consumption still has to show up on the analytics page, which is scoped to
 * the workspace rather than to what the admin can access.
 */
export async function seedHiddenAgent(
  ctx: SeedContext,
  { owner }: { owner: UserResource | undefined }
): Promise<CreatedAgent | null> {
  const { workspace, execute, logger } = ctx;

  if (!execute || !owner) {
    return null;
  }

  // The admin's own authenticator cannot see, nor create in, a restricted space
  // it is not a member of.
  const internalAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  const existingAgents = await searchAgentConfigurationsByName(
    internalAuth,
    AGENT_NAME
  );
  const existingAgent = existingAgents.find((a) => a.name === AGENT_NAME);
  if (existingAgent) {
    logger.info(
      { sId: existingAgent.sId, name: AGENT_NAME },
      "Hidden agent already exists, skipping"
    );
    return { sId: existingAgent.sId, name: AGENT_NAME };
  }

  const space = await findOrCreateRestrictedSpace(ctx, internalAuth, owner);

  const agentResult = await createAgentConfiguration(internalAuth, {
    name: AGENT_NAME,
    description: "Seeded agent that only its owner should see.",
    instructions: "You are a seeded agent used to test analytics visibility.",
    instructionsHtml: null,
    pictureUrl: DROID_AVATAR_URLS[0],
    status: "active",
    scope: "hidden",
    model: {
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      temperature: 0.7,
    },
    templateId: null,
    requestedSpaceIds: [space.id],
    tags: [],
    editors: [owner.toJSON()],
    authorId: owner.id,
  });
  if (agentResult.isErr()) {
    throw agentResult.error;
  }

  logger.info(
    {
      sId: agentResult.value.sId,
      name: AGENT_NAME,
      ownerEmail: owner.email,
      space: SPACE_NAME,
    },
    "Hidden agent created in a restricted space"
  );

  return { sId: agentResult.value.sId, name: AGENT_NAME };
}
