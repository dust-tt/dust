import { parse } from "csv-parse";
import * as fs from "fs";

import { sendEmailWithTemplate } from "@app/lib/api/email";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { isString, normalizeError } from "@app/types";
import { z } from "zod";

const MAIL_CONCURRENCY = 5;

const { DUST_CLIENT_FACING_URL } = process.env;

const CsvRecordSchema = z.object({
  author_first_name: z.string(),
  author_email: z.string(),
  agents: z.string(),
  min_reasoning_effort: z.string().optional(),
  workspace_id: z.string(),
});

type CsvRecord = z.infer<typeof CsvRecordSchema>;

async function readCsvFile(
  filePath: string
): Promise<z.infer<typeof CsvRecordSchema>[]> {
  const parser = parse({
    delimiter: ",",
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const records: CsvRecord[] = [];
  fs.createReadStream(filePath).pipe(parser);

  for await (const record of parser) {
    records.push(record);
  }
  const parseResult = z.array(CsvRecordSchema).safeParse(records);
  if (!parseResult.success) {
    throw new Error(`Failed to parse CSV file: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

async function sendReasoningToolRemovalEmail(
  record: CsvRecord,
  execute: boolean,
  logger: Logger
): Promise<{ success: boolean; error?: string }> {
  const childLogger = logger.child({ email: record.author_email });

  const email = record.author_email.trim().toLowerCase();
  const agentList = record.agents.trim();
  const minReasoningEffort = record.min_reasoning_effort?.trim().toLowerCase();
  const workspaceId = record.workspace_id.trim();

  const baseUrl = DUST_CLIENT_FACING_URL;
  if (!baseUrl) {
    throw new Error("DUST_CLIENT_FACING_URL is not defined");
  }

  let body = `<p>We're reaching out because you've built the following agents that use the Reasoning tool, which we'll be removing from Dust on Friday, November 28th.</p>

<ul>
${agentList
  .split(",")
  .map((agent) => {
    const [agentId, agentName] = agent.trim().split("|");
    const agentUrl = `${baseUrl}/w/${workspaceId}/builder/agents/${agentId}`;
    return `  <li><a href=${agentUrl}>${agentName}</a></li>`;
  })
  .join("\n")}
</ul>

<h3>Why we're making this change</h3>

<p>When we introduced the Reasoning tool in early 2025, it was designed to give you access to pure reasoning models like o1 and DeepSeek R1. These models excelled at deep, step-by-step thinking, but they could <em>only</em> reason, they could not use any tools. So we turned them into a tool themselves, allowing you to combine their reasoning capabilities with other models that <em>could</em> search your company data, browse the web, or query databases. This was the beginning of us exploring the potential of sub-agents: agents that could leverage deep reasoning <em>plus</em> take actions.</p>

<p>Today, modern reasoning models like GPT-5, o3, o4-mini, and Claude Sonnet 4.5 combine the best of both worlds. They can think deeply <em>while simultaneously</em> using tools: searching your data, browsing the web, querying databases, and more. Using these as your agent's base model delivers better performance with lower latency.</p>
`;

  // Next steps.
  if (minReasoningEffort === "medium" || minReasoningEffort === "high") {
    body += `
<h3>What happens next</h3>

<p>Good news: You're already set up for success!</p>

<p>Your agents are already configured with medium or high reasoning effort, which means you're already leveraging the full reasoning capabilities of your base model.</p>

<p>The Reasoning tool will simply be removed automatically, and your agent's performance will remain great, or even improve slightly due to reduced overhead.</p>

<h3>Timeline</h3>

<ul>
  <li>Friday, November 28th: Reasoning tool removed from all agents</li>
  <li>No action needed: Your agents are already optimized</li>
</ul>
`;
  } else {
    body += `
<h3>What happens next</h3>

<p><strong>Automatic migration (no action required):</strong></p>

<ul>
  <li>On Friday, November 28th, we'll automatically remove the Reasoning tool from all agents</li>
  <li>Your agents will continue working normally</li>
  <li>No configuration changes needed from you</li>
</ul>

<p><strong>Recommended: Maintain strong reasoning capabilities</strong></p>

<p>Since your agent currently uses the Reasoning tool${minReasoningEffort ? ` and has ${minReasoningEffort === "none" ? "no" : minReasoningEffort} reasoning effort configured` : ""}, we recommend one of these options to maintain strong reasoning:</p>

<p><strong>Option 1: Increase reasoning effort</strong> - Edit your agent and set <code>reasoningEffort</code> to "medium" or "high" in the model settings of Agent Builder if the underlying model supports it</p>

<p><strong>Option 2: Switch to a reasoning model</strong> - Change your base model to GPT-5 or Claude Sonnet 4.5 with "medium" or "high" reasoning effort</p>

<p><strong>Option 3: Do nothing</strong> - For simpler use cases, your current setup may work fine without the Reasoning tool</p>

<h3>Timeline</h3>

<ul>
  <li>Friday, November 28th: Reasoning tool removed from all agents</li>
  <li>Before Friday, November 28th: Optionally adjust your agent's reasoning configuration</li>
</ul>
`;
  }

  // Footer.
  body += `

<p>If you have any concerns, please reach out to us at support@dust.tt</p>

<p>Thank you for building with Dust!</p><br/>

<p>Best regards,`;

  if (execute) {
    const emailResult = await sendEmailWithTemplate({
      to: email,
      from: {
        name: "Dust team",
        email: "team@dust.tt",
      },
      subject: "Reasoning tool removal on November 28th",
      body,
    });

    if (emailResult.isErr()) {
      childLogger.error({ error: emailResult.error }, "Failed to send email");
      return {
        success: false,
        error: normalizeError(emailResult.error).message,
      };
    }

    childLogger.info({ email }, "Successfully sent email");
    return { success: true };
  } else {
    childLogger.info({ email, body }, "Would send email");
    return { success: true };
  }
}

makeScript(
  {
    csvPath: {
      alias: "csv",
      describe:
        "Path to the CSV file containing email, agents, and min_reasoning_effort",
      type: "string",
      demandOption: true,
    },
  },
  async ({ csvPath, execute }, logger) => {
    logger.info(
      { csvPath, execute },
      "Starting reasoning tool removal email script"
    );

    const records: CsvRecord[] = await readCsvFile(csvPath);
    logger.info(`Read ${records.length} records from CSV file`);

    if (records.length === 0) {
      throw new Error("CSV file is empty");
    }

    const validRecords = records.filter((record) => {
      if (
        !isString(record.author_email) ||
        !isString(record.agents) ||
        !isString(record.min_reasoning_effort)
      ) {
        logger.warn({ record }, "Skipping record with invalid data");
        return false;
      }
      return true;
    });

    logger.info(`Processing ${validRecords.length} valid records`);

    const results = await concurrentExecutor(
      validRecords,
      async (record) => {
        const result = await sendReasoningToolRemovalEmail(
          record,
          execute,
          logger
        );
        return { email: record.author_email, ...result };
      },
      { concurrency: MAIL_CONCURRENCY }
    );

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    logger.info(
      {
        total: results.length,
        successful,
        failed,
        execute,
      },
      "Reasoning tool removal email script completed"
    );

    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      logger.warn({ failures }, "Some operations failed");
    }

    if (execute) {
      logger.info(`Successfully sent ${successful} emails`);
    } else {
      logger.info(`Would send ${successful} emails`);
    }
  }
);
