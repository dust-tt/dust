import * as fs from "fs";
import * as path from "path";
import { QueryTypes } from "sequelize";

import {
  AgentMCPActionModel,
  AgentMCPActionOutputItemModel,
} from "@app/lib/models/agent/actions/mcp";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { makeScript } from "@app/scripts/helpers";
import type { AgentContentItemType } from "@app/types/assistant/agent_message_content";

interface OnboardingConversationInfo {
  conversationId: number;
  conversationSId: string;
  workspaceId: number;
  workspaceSId: string;
  workspaceName: string;
  createdAt: Date;
}

function formatDate(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, " UTC");
}

function formatTimestamp(date: Date): string {
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "");
}

function formatContentItem(item: AgentContentItemType): string {
  switch (item.type) {
    case "text_content":
      return item.value;
    case "reasoning":
      return `<details>\n<summary>🧠 Reasoning (${item.value.tokens} tokens)</summary>\n\n${item.value.reasoning ?? "(hidden)"}\n\n</details>`;
    case "function_call":
      return `**Tool Call:** \`${item.value.name}\`\n\n<details>\n<summary>Arguments</summary>\n\n\`\`\`json\n${item.value.arguments}\n\`\`\`\n\n</details>`;
    case "error":
      return `**❌ Error:** ${item.value.code}\n\n${item.value.message}`;
    default:
      return JSON.stringify(item);
  }
}

async function generateMarkdown(
  info: OnboardingConversationInfo
): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push(`# Onboarding Conversation: ${info.conversationSId}`);
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| Workspace | ${info.workspaceSId} (${info.workspaceName}) |`);
  lines.push(`| Created | ${formatDate(info.createdAt)} |`);
  lines.push(`| Conversation ID | ${info.conversationSId} |`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Fetch all messages for this conversation
  const messages = await MessageModel.findAll({
    where: {
      conversationId: info.conversationId,
      workspaceId: info.workspaceId,
      visibility: "visible",
    },
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: false,
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: false,
        include: [
          {
            model: AgentStepContentModel,
            as: "agentStepContents",
            required: false,
          },
        ],
      },
      {
        model: ContentFragmentModel,
        as: "contentFragment",
        required: false,
      },
    ],
    order: [
      ["rank", "ASC"],
      ["version", "DESC"],
    ],
  });

  // Group by rank and take the highest version for each
  const messagesByRank = new Map<number, (typeof messages)[0]>();
  for (const msg of messages) {
    const existing = messagesByRank.get(msg.rank);
    if (!existing || msg.version > existing.version) {
      messagesByRank.set(msg.rank, msg);
    }
  }

  const sortedMessages = Array.from(messagesByRank.values()).sort(
    (a, b) => a.rank - b.rank
  );

  let messageNum = 1;
  for (const message of sortedMessages) {
    if (message.userMessage) {
      const um = message.userMessage;
      lines.push(`## Message ${messageNum} - User`);
      lines.push("");
      lines.push(`**Sent at:** ${formatTimestamp(message.createdAt)}`);
      if (um.userContextEmail) {
        lines.push(
          `**From:** ${um.userContextFullName ?? um.userContextUsername} (${um.userContextEmail})`
        );
      } else {
        lines.push(
          `**From:** ${um.userContextFullName ?? um.userContextUsername}`
        );
      }
      lines.push(`**Origin:** ${um.userContextOrigin}`);
      lines.push("");
      lines.push(um.content);
      lines.push("");
    } else if (message.agentMessage) {
      const am = message.agentMessage;
      lines.push(
        `## Message ${messageNum} - Agent (@${am.agentConfigurationId})`
      );
      lines.push("");
      lines.push(`**Sent at:** ${formatTimestamp(message.createdAt)}`);
      lines.push(`**Status:** ${am.status}`);
      lines.push("");

      // Process step contents
      const stepContents = am.agentStepContents ?? [];

      // Group by step and take max version for each (step, index) pair
      const contentByStepIndex = new Map<string, AgentStepContentModel>();
      for (const sc of stepContents) {
        const key = `${sc.step}-${sc.index}`;
        const existing = contentByStepIndex.get(key);
        if (!existing || sc.version > existing.version) {
          contentByStepIndex.set(key, sc);
        }
      }

      // Sort by step then index
      const sortedContents = Array.from(contentByStepIndex.values()).sort(
        (a, b) => {
          if (a.step !== b.step) {
            return a.step - b.step;
          }
          return a.index - b.index;
        }
      );

      // Collect text content and function calls
      const textParts: string[] = [];
      const functionCalls: AgentStepContentModel[] = [];

      for (const sc of sortedContents) {
        const content = sc.value as AgentContentItemType;
        if (content.type === "text_content") {
          textParts.push(content.value);
        } else if (content.type === "function_call") {
          functionCalls.push(sc);
        } else if (content.type === "reasoning") {
          lines.push(formatContentItem(content));
          lines.push("");
        } else if (content.type === "error") {
          lines.push(formatContentItem(content));
          lines.push("");
        }
      }

      // Output combined text response
      if (textParts.length > 0) {
        lines.push("### Response");
        lines.push("");
        lines.push(textParts.join("\n\n"));
        lines.push("");
      }

      // Output tool calls with their results
      if (functionCalls.length > 0) {
        lines.push("### Tool Calls");
        lines.push("");

        for (const fc of functionCalls) {
          const content = fc.value as AgentContentItemType;
          if (content.type !== "function_call") {
            continue;
          }

          lines.push(`#### Tool: \`${content.value.name}\``);
          lines.push("");

          // Fetch MCP action for this function call
          const mcpAction = await AgentMCPActionModel.findOne({
            where: {
              agentMessageId: am.id,
              stepContentId: fc.id,
              workspaceId: info.workspaceId,
            },
            include: [
              {
                model: AgentMCPActionOutputItemModel,
                as: "outputItems",
                required: false,
              },
            ],
          });

          if (mcpAction) {
            lines.push(`**Status:** ${mcpAction.status}`);
            if (mcpAction.executionDurationMs) {
              lines.push(`**Duration:** ${mcpAction.executionDurationMs}ms`);
            }
            lines.push("");

            // Inputs
            lines.push("<details>");
            lines.push("<summary>Inputs</summary>");
            lines.push("");
            lines.push("```json");
            lines.push(JSON.stringify(mcpAction.augmentedInputs, null, 2));
            lines.push("```");
            lines.push("");
            lines.push("</details>");
            lines.push("");

            // Outputs
            if (mcpAction.outputItems && mcpAction.outputItems.length > 0) {
              lines.push("<details>");
              lines.push("<summary>Outputs</summary>");
              lines.push("");
              for (const outputItem of mcpAction.outputItems) {
                const outputContent = outputItem.content as {
                  type: string;
                  text?: string;
                };
                if (outputContent.type === "text" && outputContent.text) {
                  // Truncate very long outputs
                  const text = outputContent.text;
                  if (text.length > 2000) {
                    lines.push(
                      "```\n" +
                        text.substring(0, 2000) +
                        "\n... (truncated)\n```"
                    );
                  } else {
                    lines.push("```\n" + text + "\n```");
                  }
                } else {
                  lines.push("```json");
                  lines.push(JSON.stringify(outputContent, null, 2));
                  lines.push("```");
                }
                lines.push("");
              }
              lines.push("</details>");
              lines.push("");
            }
          } else {
            // No MCP action found, just show the function call args
            lines.push("<details>");
            lines.push("<summary>Arguments</summary>");
            lines.push("");
            lines.push("```json");
            lines.push(content.value.arguments);
            lines.push("```");
            lines.push("");
            lines.push("</details>");
            lines.push("");
          }
        }
      }

      // Show errors if any
      if (am.errorCode) {
        lines.push("### Error");
        lines.push("");
        lines.push(`**Code:** ${am.errorCode}`);
        lines.push(`**Message:** ${am.errorMessage ?? "(no message)"}`);
        lines.push("");
      }
    } else if (message.contentFragment) {
      const cf = message.contentFragment;
      lines.push(`## Message ${messageNum} - Content Fragment`);
      lines.push("");
      lines.push(`**Sent at:** ${formatTimestamp(message.createdAt)}`);
      lines.push(`**Title:** ${cf.title}`);
      lines.push(`**Type:** ${cf.contentType}`);
      if (cf.sourceUrl) {
        lines.push(`**Source:** ${cf.sourceUrl}`);
      }
      lines.push("");
      if (cf.textBytes && cf.textBytes > 0) {
        lines.push(`_(Content: ${cf.textBytes} bytes)_`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
    messageNum++;
  }

  return lines.join("\n");
}

makeScript(
  {
    afterDate: {
      alias: "a",
      describe:
        "Export conversations created after this date (ISO format, e.g., 2024-12-01)",
      type: "string" as const,
      demandOption: true,
    },
    outputDir: {
      alias: "o",
      describe: "Output directory for markdown files",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ afterDate, outputDir, execute }, logger) => {
    const parsedDate = new Date(afterDate);
    if (isNaN(parsedDate.getTime())) {
      logger.error(
        { afterDate },
        "Invalid date format. Use ISO format (e.g., 2024-12-01)"
      );
      return;
    }

    logger.info(
      { afterDate: parsedDate.toISOString(), outputDir },
      "Finding onboarding conversations..."
    );

    // Find all conversations that have at least one user message with userContextOrigin = 'onboarding_conversation'
    // eslint-disable-next-line dust/no-raw-sql
    const onboardingConversations = await frontSequelize.query<{
      conversationId: number;
      conversationSId: string;
      workspaceId: number;
      workspaceSId: string;
      workspaceName: string;
      createdAt: Date;
    }>(
      `
      SELECT DISTINCT
        c.id as "conversationId",
        c."sId" as "conversationSId",
        c."workspaceId" as "workspaceId",
        w."sId" as "workspaceSId",
        w.name as "workspaceName",
        c."createdAt" as "createdAt"
      FROM conversations c
      JOIN messages m ON m."conversationId" = c.id AND m."workspaceId" = c."workspaceId"
      JOIN user_messages um ON um.id = m."userMessageId" AND um."workspaceId" = c."workspaceId"
      JOIN workspaces w ON w.id = c."workspaceId"
      WHERE um."userContextOrigin" = 'onboarding_conversation'
        AND c."createdAt" > :afterDate
        AND c.visibility != 'deleted'
      ORDER BY c."createdAt" DESC
      `,
      {
        type: QueryTypes.SELECT,
        replacements: { afterDate: parsedDate },
      }
    );

    logger.info(
      { count: onboardingConversations.length },
      "Found onboarding conversations"
    );

    if (!execute) {
      logger.info(
        "Dry run mode. First 10 conversations that would be exported:"
      );
      for (const conv of onboardingConversations.slice(0, 10)) {
        logger.info({
          conversationSId: conv.conversationSId,
          workspaceSId: conv.workspaceSId,
          workspaceName: conv.workspaceName,
          createdAt: formatDate(conv.createdAt),
        });
      }
      return;
    }

    // Create output directory if it doesn't exist
    const resolvedOutputDir = path.resolve(outputDir);
    if (!fs.existsSync(resolvedOutputDir)) {
      fs.mkdirSync(resolvedOutputDir, { recursive: true });
      logger.info({ outputDir: resolvedOutputDir }, "Created output directory");
    }

    // Export each conversation
    let exported = 0;
    let failed = 0;
    for (const conv of onboardingConversations) {
      try {
        const markdown = await generateMarkdown(conv);
        const filename = `${conv.conversationSId}.md`;
        const filepath = path.join(resolvedOutputDir, filename);
        fs.writeFileSync(filepath, markdown, "utf-8");
        exported++;
        if (exported % 100 === 0) {
          logger.info(
            { exported, total: onboardingConversations.length },
            "Progress"
          );
        }
      } catch (err) {
        failed++;
        logger.error(
          { conversationSId: conv.conversationSId, error: err },
          "Failed to export conversation"
        );
      }
    }

    logger.info(
      {
        exported,
        failed,
        total: onboardingConversations.length,
        outputDir: resolvedOutputDir,
      },
      "Export completed"
    );
  }
);
