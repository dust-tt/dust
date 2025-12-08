import * as fs from "fs";
import * as path from "path";
import { QueryTypes } from "sequelize";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { Authenticator } from "@app/lib/auth";
import { frontSequelize } from "@app/lib/resources/storage";
import { makeScript } from "@app/scripts/helpers";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types";

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function generateMarkdown(
  conversation: ConversationType,
  workspaceSId: string
): string {
  const lines: string[] = [];

  lines.push("# Onboarding Conversation");
  lines.push("");
  lines.push(`- **Conversation sId**: ${conversation.sId}`);
  lines.push(`- **Workspace sId**: ${workspaceSId}`);
  lines.push(
    `- **Created At**: ${new Date(conversation.created).toISOString()}`
  );
  lines.push(`- **Title**: ${conversation.title ?? "(no title)"}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const messageVersions of conversation.content) {
    // Get the latest version of the message
    const message = messageVersions[messageVersions.length - 1];

    if (message.type === "user_message") {
      const userMsg = message as UserMessageType;
      const isProgrammatic =
        userMsg.context.origin === "onboarding_conversation";

      if (isProgrammatic) {
        lines.push("## @user (programmatic - hidden from UI)");
      } else {
        lines.push("## @user");
      }
      lines.push("");
      lines.push(userMsg.content);
    } else if (message.type === "agent_message") {
      const agentMsg = message as AgentMessageType;
      const agentName = agentMsg.configuration.name;

      lines.push(`## @${agentName}`);
      lines.push("");

      if (agentMsg.status !== "succeeded") {
        lines.push(`**Status**: ${agentMsg.status}`);
        if (agentMsg.error) {
          lines.push(`**Error**: ${agentMsg.error.message}`);
        }
        lines.push("");
      }

      // Combine rawContents from all steps
      const content = agentMsg.rawContents
        .sort((a, b) => a.step - b.step)
        .map((rc) => rc.content)
        .join("\n");
      lines.push(content || "(no content)");

      if (agentMsg.actions.length > 0) {
        lines.push("");
        lines.push("**Tools used**:");
        for (const action of agentMsg.actions) {
          lines.push(`- \`${action.functionCallName}\` (${action.status})`);
          if (action.params && Object.keys(action.params).length > 0) {
            const paramsStr = JSON.stringify(action.params, null, 2)
              .split("\n")
              .map((line) => `    ${line}`)
              .join("\n");
            lines.push(`  - Params:`);
            lines.push("```json");
            lines.push(paramsStr);
            lines.push("```");
          }
        }
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

makeScript(
  {
    startTime: {
      type: "string",
      demandOption: true,
      description:
        "Start time (ISO format) to filter conversations created after this time",
    },
    endTime: {
      type: "string",
      demandOption: false,
      description:
        "Optional end time (ISO format) to filter conversations created before this time",
    },
    baseDir: {
      type: "string",
      demandOption: true,
      description: "Base directory where the output folder will be created",
    },
  },
  async ({ startTime, endTime, baseDir }, logger) => {
    // Validate base directory exists.
    if (!fs.existsSync(baseDir)) {
      throw new Error(`Base directory does not exist: ${baseDir}`);
    }

    const startDate = new Date(startTime);
    if (isNaN(startDate.getTime())) {
      throw new Error(`Invalid start time: ${startTime}`);
    }

    let endDate: Date | undefined;
    if (endTime) {
      endDate = new Date(endTime);
      if (isNaN(endDate.getTime())) {
        throw new Error(`Invalid end time: ${endTime}`);
      }
    }

    logger.info(
      {
        startTime: startDate.toISOString(),
        endTime: endDate?.toISOString() ?? "now",
      },
      "Extracting onboarding conversations"
    );

    // Use raw SQL to identify all workspace/conversation pairs with onboarding conversations.
    // This is the only cross-workspace query; all subsequent queries use proper workspace scoping.
    // eslint-disable-next-line dust/no-raw-sql
    const onboardingConversations = await frontSequelize.query<{
      workspaceSId: string;
      conversationSId: string;
      conversationCreatedAt: Date;
    }>(
      `
      SELECT DISTINCT
        w."sId" as "workspaceSId",
        c."sId" as "conversationSId",
        c."createdAt" as "conversationCreatedAt"
      FROM conversations c
      JOIN workspaces w ON w.id = c."workspaceId"
      JOIN messages m ON m."conversationId" = c.id
      JOIN user_messages um ON um.id = m."userMessageId"
      WHERE um."userContextOrigin" = 'onboarding_conversation'
        AND c."createdAt" >= :startDate
        ${endDate ? 'AND c."createdAt" <= :endDate' : ""}
      ORDER BY c."createdAt" DESC
      `,
      {
        replacements: { startDate, ...(endDate ? { endDate } : {}) },
        type: QueryTypes.SELECT,
      }
    );

    logger.info(
      { count: onboardingConversations.length },
      "Found onboarding conversations"
    );

    if (onboardingConversations.length === 0) {
      logger.info("No onboarding conversations found in the specified period");
      return;
    }

    // Create output directory.
    const runTimestamp = formatTimestamp(new Date());
    const outputDir = path.join(
      baseDir,
      `onboarding-conversations-${runTimestamp}`
    );

    fs.mkdirSync(outputDir, { recursive: true });
    logger.info({ outputDir }, "Created output directory");

    // Group conversations by workspace for efficient auth creation.
    const conversationsByWorkspace = new Map<
      string,
      Array<{ conversationSId: string; conversationCreatedAt: Date }>
    >();
    for (const conv of onboardingConversations) {
      const existing = conversationsByWorkspace.get(conv.workspaceSId) ?? [];
      existing.push({
        conversationSId: conv.conversationSId,
        conversationCreatedAt: conv.conversationCreatedAt,
      });
      conversationsByWorkspace.set(conv.workspaceSId, existing);
    }

    let totalConversations = 0;

    // Extract conversations using getConversation (like Poke does).
    for (const [workspaceSId, conversations] of conversationsByWorkspace) {
      const auth = await Authenticator.internalAdminForWorkspace(workspaceSId);

      for (const { conversationSId, conversationCreatedAt } of conversations) {
        try {
          const conversationRes = await getConversation(auth, conversationSId);

          if (conversationRes.isErr()) {
            logger.error(
              { conversationSId, error: conversationRes.error },
              "Failed to fetch conversation"
            );
            continue;
          }

          const conversation = conversationRes.value;
          const filename = `${formatTimestamp(new Date(conversationCreatedAt))}_${conversationSId}.md`;
          const filepath = path.join(outputDir, filename);

          const markdown = generateMarkdown(conversation, workspaceSId);
          fs.writeFileSync(filepath, markdown);

          totalConversations++;

          logger.info(
            { conversationSId, workspaceSId, filename },
            "Extracted conversation"
          );
        } catch (error) {
          logger.error(
            {
              conversationSId,
              error: error instanceof Error ? error.message : String(error),
            },
            "Failed to extract conversation"
          );
        }
      }
    }

    logger.info({ outputDir, totalConversations }, "Extraction complete");
  }
);
