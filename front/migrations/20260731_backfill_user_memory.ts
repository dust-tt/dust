import { getUserMemory, setUserMemory } from "@app/lib/api/user_memory";
import { Authenticator } from "@app/lib/auth";
import type { Logger } from "pino";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { MAX_USER_MEMORY_CHARS } from "@app/types/api/me/memory";
import type { ModelId } from "@app/types/shared/model_id";

// We retrieve the memories for the dust global agent.
const AGENT_ID = "dust";

// We use this marker to indicate to the user that the memory was imported from Dust agent memory
const IMPORT_MARKER = "## Imported from Dust agent memory";

async function retrieveAllMemoriesDustMemories(
  auth: Authenticator
): Promise<AgentMemoryModel[]> {
  return AgentMemoryModel.findAll({
    where: {
      agentConfigurationId: AGENT_ID,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });
}

function formatMemories(memories: AgentMemoryModel[]): string {
  const entries = [...memories]
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .map((m) => m.content.trim())
    .filter((c) => c.length > 0);

  if (entries.length === 0) {
    return "";
  }

  const bullets = entries.map((e) => `- ${e}`);

  return [IMPORT_MARKER, "", ...bullets, ""].join("\n");
}

async function createUserMemory(
  auth: Authenticator,
  {
    userMemory,
    execute,
    logger,
  }: { userMemory: string; execute: boolean; logger: Logger }
): Promise<void> {
  if (userMemory.length === 0) {
    return;
  }

  const existingResult = await getUserMemory(auth);
  if (existingResult.isErr()) {
    logger.error(
      { error: existingResult.error.message },
      "Failed to read MEMORY.md, skipping"
    );
    return;
  }

  // Create-only, we skip users who already have a memory
  if (existingResult.value.length > 0) {
    logger.warn("User already has a MEMORY.md, skipping");
    return;
  }

  if (execute) {
    // setUserMemory does not enforce MAX_USER_MEMORY_CHARS, so this may write
    // past the UI cap by design (chosen behavior = write full content). We warn
    // when it exceeds the cap so we know how much to bump the cap
    const writeResult = await setUserMemory(auth, userMemory);
    if (writeResult.isErr()) {
      logger.error(
        { error: writeResult.error.message },
        "Failed to write MEMORY.md"
      );
      return;
    }

    if (userMemory.length > MAX_USER_MEMORY_CHARS) {
      logger.warn(
        { newChars: userMemory.length },
        `Created MEMORY.md from imported agent memory, but exceeds ${MAX_USER_MEMORY_CHARS} char UI cap`
      );
    } else {
      logger.info(
        { newChars: userMemory.length },
        "Created MEMORY.md from imported agent memory"
      );
    }
  } else {
    logger.info(
      { newChars: userMemory.length },
      "Dry run: would create MEMORY.md from imported agent memory"
    );
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string" as const,
    },
  },
  async ({ workspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        const workspaceAuth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        const allWorkspaceDustMemories =
          await retrieveAllMemoriesDustMemories(workspaceAuth);

        const memoriesByUserModelId = new Map<ModelId, AgentMemoryModel[]>();
        for (const memory of allWorkspaceDustMemories) {
          if (!memory.userId) {
            continue;
          }

          const userMemories = memoriesByUserModelId.get(memory.userId);
          if (userMemories) {
            userMemories.push(memory);
          } else {
            memoriesByUserModelId.set(memory.userId, [memory]);
          }
        }

        // Fetch the users to get their sId for the Authenticator.
        const users = await UserResource.fetchByModelIds([
          ...memoriesByUserModelId.keys(),
        ]);

        for (const user of users) {
          const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
            user.sId,
            workspace.sId
          );

          const userDustMemories = memoriesByUserModelId.get(user.id) ?? [];
          if (userDustMemories.length === 0) {
            continue;
          }

          const userMemory = formatMemories(userDustMemories);
          await createUserMemory(userAuth, {
            userMemory,
            execute,
            logger: logger.child({
              workspaceId: workspace.sId,
              userId: user.sId,
            }),
          });
        }
      },
      { wId: workspaceId }
    );
  }
);
