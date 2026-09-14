import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";

import type { SeedContext } from "./types";

export async function backdateAgent(
  ctx: SeedContext,
  { agentId, createdAt }: { agentId: string; createdAt: Date }
): Promise<void> {
  const { auth, execute, logger } = ctx;

  logger.info({ agentId, createdAt }, "Backdating agent");

  if (!execute) {
    return;
  }

  await AgentConfigurationFactory.backdate(auth, agentId, createdAt);
}
