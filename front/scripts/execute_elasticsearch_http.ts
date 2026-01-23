import * as fs from "fs";
import * as path from "path";

import { getClient } from "@app/lib/api/elasticsearch";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types";

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

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface ParsedHttpFile {
  method: HttpMethod;
  path: string;
  body?: Record<string, unknown>;
}

function isHttpMethod(method: string): method is HttpMethod {
  return ["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method);
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
  if (!isHttpMethod(method)) {
    throw new Error(`Invalid HTTP method: ${method}`);
  }

  const httpPath = match[2].trim();

  // Parse JSON body from remaining lines
  const bodyLines = lines.slice(1).join("\n").trim();
  let body: Record<string, unknown> | undefined;

  if (bodyLines) {
    const parsed = JSON.parse(bodyLines);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      body = parsed;
    } else {
      throw new Error("JSON body must be an object");
    }
  }

  return { method, path: httpPath, body };
}

async function executeRequest(
  method: HttpMethod,
  httpPath: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const client = await getClient();

  // Remove leading slash from path if present
  const cleanPath = httpPath.startsWith("/") ? httpPath.slice(1) : httpPath;

  // Use the transport layer to make arbitrary requests
  const requestParams: {
    method: HttpMethod;
    path: string;
    body?: Record<string, unknown>;
  } = {
    method,
    path: cleanPath,
  };

  if (body !== undefined) {
    requestParams.body = body;
  }

  const response = await client.transport.request(requestParams);

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
      const error = normalizeError(err);
      logger.error(`❌ Request failed: ${error.message}`);
      throw err;
    }
  }
);
