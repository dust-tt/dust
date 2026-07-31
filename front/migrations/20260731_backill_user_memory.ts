import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { Authenticator } from "@app/lib/auth";
import type { Logger } from "pino";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { UserResource } from "@app/lib/resources/user_resource";
import { ModelId } from "@app/types/shared/model_id";

// We retrieve the memories for the dust global agent.
const AGENT_ID = "dust";

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
  return "";
}

async function upsertUserMemory(
  auth: Authenticator,
  {
    userMemory,
    execute,
    logger,
  }: { userMemory: string; execute: boolean; logger: Logger }
): Promise<void> {
  if (execute) {
    // upload to GCS
  } else {
    // just log what would've been done
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
            workspaceId
          );

          const userDustMemories = memoriesByUserModelId.get(user.id) ?? [];
          if (userDustMemories.length === 0) {
            continue;
          }

          const userMemory = formatMemories(userDustMemories);
          await upsertUserMemory(userAuth, {
            userMemory,
            execute,
            logger,
          });
        }
      },
      { wId: workspaceId }
    );
  }
);
