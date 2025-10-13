#!/usr/bin/env tsx

import assert from "assert";
import { Op } from "sequelize";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { storeAgentAnalyticsActivity } from "@app/temporal/agent_loop/activities/agent_analytics";
import type { AgentLoopArgsWithTiming } from "@app/types/assistant/agent_run";
import type { ConversationType } from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";

async function main() {
  const workspaceId = process.argv[2];
  const daysBack = parseInt(process.argv[3]) || 30; // Default to 30 days
  const limit = parseInt(process.argv[4]) || undefined; // Optional limit
  const dryRun = process.argv.includes("--dry-run");

  if (!workspaceId) {
    console.error(
      "Usage: tsx scripts/backfill_agent_analytics.ts <workspaceId> [daysBack=30] [limit] [--dry-run]"
    );
    console.error("Examples:");
    console.error(
      "  tsx scripts/backfill_agent_analytics.ts workspace123 --dry-run"
    );
    console.error("  tsx scripts/backfill_agent_analytics.ts workspace123 7");
    console.error(
      "  tsx scripts/backfill_agent_analytics.ts workspace123 30 100"
    );
    process.exit(1);
  }

  console.log(`Backfilling agent analytics for workspace: ${workspaceId}`);
  console.log(`Looking back: ${daysBack} days`);
  if (limit) {
    console.log(`Processing limit: ${limit} messages`);
  }
  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No JSONL files will be generated");
  } else {
    console.log("📁 JSONL files will be written to: ./analytics_output/");
  }

  // Create authenticator for the workspace
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  // Calculate date range
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  console.log(
    `Processing agent messages from ${cutoffDate.toISOString()} onwards...`
  );

  // Query agent messages
  const queryOptions: any = {
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      createdAt: {
        [Op.gte]: cutoffDate,
      },
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
        // where: {
        //   status: "completed", // Only process completed agent messages
        // },
      },
    ],
    order: [["createdAt", "ASC"]],
  };

  if (limit) {
    queryOptions.limit = limit;
  }

  const agentMessages = await Message.findAll(queryOptions);

  console.log(
    `Found ${agentMessages.length} completed agent messages to process`
  );

  let processedCount = 0;
  let errorCount = 0;
  const conversationCache = new Map();

  // Process each agent message
  for (const messageRow of agentMessages) {
    try {
      console.log(
        `Processing agent message ${processedCount + 1}/${agentMessages.length}: ${messageRow.sId}`
      );

      const conversationResource = await ConversationResource.fetchByModelId(
        messageRow.conversationId
      );
      assert(conversationResource, "Conversation not found");

      // Get the conversation (with caching)
      let conversation = conversationCache.get(conversationResource.sId);
      if (!conversation) {
        const conversationRes = await getConversation(
          auth,
          conversationResource.sId
        );
        if (conversationRes.isErr()) {
          console.warn(
            `Could not find conversation ${conversationResource.sId}, skipping`
          );
          continue;
        }
        conversation = conversationRes.value;
        conversationCache.set(conversationResource.sId, conversation);
      }

      // Find the agent message and corresponding user message
      const messageInfo = findAgentAndUserMessages(
        conversation,
        messageRow.sId,
        messageRow.version
      );

      if (!messageInfo) {
        console.warn(
          `Could not find agent/user message pair for ${messageRow.sId}, skipping`
        );
        continue;
      }

      // Build AgentLoopArgs
      const agentLoopArgs: AgentLoopArgsWithTiming = {
        agentMessageId: messageInfo.agentMessage.sId,
        agentMessageVersion: messageInfo.agentMessage.version,
        conversationId: conversationResource.sId,
        conversationTitle: conversation.title,
        userMessageId: messageInfo.userMessage.sId,
        userMessageVersion: messageInfo.userMessage.version,
        initialStartTime: Date.now(),
      };

      // Calculate latency (approximate - using the creation time difference)
      const latencyMs = messageRow.agentMessage!.completedAt
        ? messageRow.agentMessage!.completedAt.getTime() -
          messageRow.createdAt.getTime()
        : 0;

      // Call our analytics activity (or skip if dry run)
      if (!dryRun) {
        await storeAgentAnalyticsActivity(auth.toJSON(), {
          agentLoopArgs,
          status: "completed",
          latencyMs,
        });
      } else {
        console.log(
          `  📋 Would process: ${agentLoopArgs.agentMessageId} (${latencyMs}ms latency)`
        );
      }

      processedCount++;
      console.log(`✓ Processed agent message ${messageRow.sId}`);

      // Add a small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      errorCount++;
      console.error(
        `✗ Failed to process agent message ${messageRow.sId}:`,
        error instanceof Error ? error.message : String(error)
      );
      // Continue processing other messages
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total messages found: ${agentMessages.length}`);
  console.log(`Successfully processed: ${processedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(
    `Completion rate: ${((processedCount / agentMessages.length) * 100).toFixed(1)}%`
  );

  if (!dryRun && processedCount > 0) {
    const timestamp = new Date().toISOString().split("T")[0];
    const expectedFilename = `agent_analytics_${workspaceId}_${timestamp}.jsonl`;
    console.log(`\n📁 Generated files:`);
    console.log(`  ./analytics_output/${expectedFilename}`);
    console.log(`\n🚀 To index in Elasticsearch, run:`);
    console.log(`  curl -X POST "localhost:9200/_bulk" -H "Content-Type: application/x-ndjson" --data-binary "@analytics_output/${expectedFilename}"`);
  }
}

/**
 * Find the agent message and its corresponding user message from conversation structure
 * Based on the message groups structure where user message typically precedes agent message
 */
function findAgentAndUserMessages(
  conversation: ConversationType,
  agentMessageSId: string,
  agentMessageVersion: number
) {
  // Find the message group containing our target agent message
  for (let i = conversation.content.length - 1; i >= 0; i--) {
    const messageGroup = conversation.content[i];

    // Look for the agent message in this group
    const agentMessage = messageGroup.find(
      (msg) =>
        isAgentMessageType(msg) &&
        msg.sId === agentMessageSId &&
        msg.version === agentMessageVersion
    );

    if (agentMessage) {
      // Found the agent message, now find the user message that triggered it
      // Look in the same group first, then in previous groups

      // Check current group for user message
      const userMessageInGroup = messageGroup.find((msg) =>
        isUserMessageType(msg)
      );
      if (userMessageInGroup) {
        return {
          agentMessage,
          userMessage: userMessageInGroup,
        };
      }

      // Look in previous message groups for user message
      for (let j = i - 1; j >= 0; j--) {
        const prevGroup = conversation.content[j];
        const userMessage = prevGroup.find((msg) => isUserMessageType(msg));
        if (userMessage) {
          return {
            agentMessage,
            userMessage,
          };
        }
      }
    }
  }

  return null;
}

// Run the script
main().catch((error) => {
  console.error("Script failed:", error);
  process.exit(1);
});
