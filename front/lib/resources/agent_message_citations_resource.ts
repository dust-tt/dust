import type { Authenticator } from "@app/lib/auth";
import type { PrecomputedGeneratedFile } from "@app/lib/resources/storage/models/agent_message_citations";
import { AgentMessageCitationsModel } from "@app/lib/resources/storage/models/agent_message_citations";
import type { CitationType } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { Op } from "sequelize";

export type PrecomputedCitationsData = {
  citations: Record<string, CitationType>;
  generatedFiles: PrecomputedGeneratedFile[];
};

// TODO(message-resource): This resource should be part of a more general AgentMessageResource.
// This is just a wrapper around two static methods for upserting and fetching precomputed citation data for agent messages.
// Ideally, we'd message.upsertPrecomputedCitationsData(...) and message.fetchPrecomputedCitationsData(...) instead of having a
// separate resource class. When AgentMessageResource comes to life, this class should be refactored to be a part of that.
export class AgentMessageCitationsResource {
  /**
   * Upsert precomputed citations for an agent message.
   * Merges new citations and generated files with any existing data
   * (supports incremental writes from multiple action successes).
   * Returns Result to allow callers to handle errors gracefully.
   */
  static async upsertPrecomputedData(
    auth: Authenticator,
    {
      agentMessageId,
      citations,
      generatedFiles,
    }: {
      agentMessageId: ModelId;
      citations: Record<string, CitationType>;
      generatedFiles: PrecomputedGeneratedFile[];
    }
  ): Promise<Result<void, Error>> {
    const workspaceId = auth.getNonNullableWorkspace().id;

    const existing = await AgentMessageCitationsModel.findOne({
      where: { workspaceId, agentMessageId },
    });

    if (existing) {
      await existing.update({
        citations: { ...existing.citations, ...citations },
        generatedFiles: [...existing.generatedFiles, ...generatedFiles],
      });
    } else {
      await AgentMessageCitationsModel.create({
        workspaceId,
        agentMessageId,
        citations,
        generatedFiles,
      });
    }

    return new Ok(undefined);
  }

  /**
   * Batch-fetch precomputed citation data for a list of agent message IDs.
   * Returns a Map keyed by agentMessageId for O(1) lookup.
   */
  static async fetchByAgentMessageIds(
    auth: Authenticator,
    agentMessageIds: ModelId[]
  ): Promise<Map<ModelId, PrecomputedCitationsData>> {
    if (agentMessageIds.length === 0) {
      return new Map();
    }

    const workspaceId = auth.getNonNullableWorkspace().id;

    const rows = await AgentMessageCitationsModel.findAll({
      where: {
        workspaceId,
        agentMessageId: { [Op.in]: agentMessageIds },
      },
    });

    const result = new Map<ModelId, PrecomputedCitationsData>();
    for (const row of rows) {
      result.set(row.agentMessageId, {
        citations: row.citations,
        generatedFiles: row.generatedFiles,
      });
    }

    return result;
  }
}
