import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

import { getClient } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";

/**
 * Script to execute HTTP files against Elasticsearch
 *
 * Usage:
 * tsx front/scripts/execute_elasticsearch_http.ts --file path/to/file.http [--execute]
 *
 * The HTTP file format should be:
 * - First line: METHOD /path (e.g., "POST /index/_update_by_query")
 * - Remaining lines: JSON body
 *
 * Supported methods: GET, POST, PUT, DELETE
 */

interface ParsedHttpFile {
  method: string;
  path: string;
  body?: unknown;
}

function parseHttpFile(filePath: string): ParsedHttpFile {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n");

  if (lines.length === 0) {
    throw new Error("HTTP file is empty");
  }

  // Parse first line: METHOD /path
  const firstLine = lines[0].trim();
  const match = firstLine.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)$/i);
  if (!match) {
    throw new Error(
      `Invalid HTTP file format. First line should be "METHOD /path", got: ${firstLine}`
    );
  }

  const method = match[1].toUpperCase();
  const httpPath = match[2].trim();

  // Parse JSON body from remaining lines
  const bodyLines = lines.slice(1).join("\n").trim();
  let body: unknown | undefined;

  if (bodyLines) {
    try {
      body = JSON.parse(bodyLines);
    } catch (err) {
      throw new Error(
        `Failed to parse JSON body in HTTP file: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { method, path: httpPath, body };
}

async function executeRequest(
  method: string,
  httpPath: string,
  body?: unknown
): Promise<unknown> {
  const client = await getClient();

  // Remove leading slash from path if present
  const cleanPath = httpPath.startsWith("/") ? httpPath.slice(1) : httpPath;

  // Use the transport layer to make arbitrary requests
  // Cast body to satisfy TypeScript's RequestBody type requirement
  const response = await client.transport.request({
    method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    path: cleanPath,
    ...(body !== undefined && { body: body as Record<string, unknown> }),
  } as Parameters<typeof client.transport.request>[0]);

  return response;
}

makeScript(
  {
    file: {
      type: "string",
      describe: "Path to the HTTP file to execute",
      demandOption: true,
      alias: "f",
    },
  },
  async ({ file, execute }, logger) => {
    // Resolve file path - try relative to current directory first, then relative to migrations directory
    let filePath: string;
    if (path.isAbsolute(file)) {
      filePath = file;
    } else {
      // Try relative to current directory
      const cwdPath = path.resolve(process.cwd(), file);
      if (fs.existsSync(cwdPath)) {
        filePath = cwdPath;
      } else {
        // Try relative to migrations directory
        const migrationsPath = path.resolve(
          __dirname,
          "../lib/analytics/migrations",
          file
        );
        if (fs.existsSync(migrationsPath)) {
          filePath = migrationsPath;
        } else {
          filePath = cwdPath; // Will fail with a clear error message below
        }
      }
    }

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    logger.info(`Reading HTTP file: ${filePath}`);

    let parsed: ParsedHttpFile;
    try {
      parsed = parseHttpFile(filePath);
    } catch (err) {
      throw new Error(
        `Failed to parse HTTP file: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    logger.info(`Method: ${parsed.method}`);
    logger.info(`Path: ${parsed.path}`);
    if (parsed.body) {
      logger.info(`Body: ${JSON.stringify(parsed.body, null, 2)}`);
    }

    if (!execute) {
      logger.info(
        `⚠️ Would execute ${parsed.method} ${parsed.path} against Elasticsearch.`
      );

      return;
    } else {
      logger.info(
        `⚠️ Will execute ${parsed.method} ${parsed.path} against Elasticsearch.`
      );
    }

    logger.info(`\nExecuting ${parsed.method} ${parsed.path}...`);

    try {
      const response = await executeRequest(
        parsed.method,
        parsed.path,
        parsed.body
      );
      logger.info("✅ Request executed successfully");
      logger.info(`Response: ${JSON.stringify(response, null, 2)}`);
    } catch (err) {
      logger.error(
        `❌ Request failed: ${err instanceof Error ? err.message : String(err)}`
      );
      if (err instanceof Error && "meta" in err) {
        const meta = (err as { meta?: unknown }).meta;
        logger.error(`Error details: ${JSON.stringify(meta, null, 2)}`);
      }
      throw err;
    }
  }
);
