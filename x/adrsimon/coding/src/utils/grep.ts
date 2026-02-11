import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { spawn } from "child_process";
import { EOL } from "os";
import path from "path";

import { normalizeError } from "./errors.js";

interface GrepResult {
  filePath: string;
  content: string;
  lineNumber: number;
}

export async function performGrep(
  pattern: string,
  searchPath: string,
  filePattern?: string
): Promise<Result<string, Error>> {
  const grepArgs = ["-r", "-n", "-H", "-E"];
  const commonExcludes = [".git", "node_modules", "bower_components"];
  for (const dir of commonExcludes) {
    grepArgs.push(`--exclude-dir=${dir}`);
  }
  if (filePattern) {
    grepArgs.push(`--include=${filePattern}`);
  }
  grepArgs.push(pattern);
  grepArgs.push(".");

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("grep", grepArgs, {
        cwd: searchPath,
        windowsHide: true,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const onData = (chunk: Buffer) => stdoutChunks.push(chunk);
      const onStderr = (chunk: Buffer) => {
        const stderrStr = chunk.toString();
        if (
          !stderrStr.includes("Permission denied") &&
          !/grep:.*: Is a directory/i.test(stderrStr)
        ) {
          stderrChunks.push(chunk);
        }
      };
      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`Failed to start system grep: ${err.message}`));
      };
      const onClose = (code: number | null) => {
        const stdoutData = Buffer.concat(stdoutChunks).toString("utf8");
        const stderrData = Buffer.concat(stderrChunks).toString("utf8").trim();
        cleanup();
        if (code === 0) {
          resolve(stdoutData);
        } else if (code === 1) {
          resolve("");
        } else {
          if (stderrData) {
            reject(
              new Error(`System grep exited with code ${code}: ${stderrData}`)
            );
          } else {
            resolve("");
          }
        }
      };

      const cleanup = () => {
        child.stdout.removeListener("data", onData);
        child.stderr.removeListener("data", onStderr);
        child.removeListener("error", onError);
        child.removeListener("close", onClose);
        if (child.connected) {
          child.disconnect();
        }
      };

      child.stdout.on("data", onData);
      child.stderr.on("data", onStderr);
      child.on("error", onError);
      child.on("close", onClose);
    });

    return new Ok(output);
  } catch (grepError: unknown) {
    return new Err(normalizeError(grepError));
  }
}

export function formatGrepRes(
  unformattedGrep: string,
  basePath: string
): GrepResult[] {
  const grepResults: GrepResult[] = [];

  const grepLines = unformattedGrep.split(EOL);
  for (const line of grepLines) {
    if (!line.trim()) {
      continue;
    }

    const firstColon = line.indexOf(":");
    if (firstColon === -1) {
      continue;
    }
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon === -1) {
      continue;
    }

    const unformattedFilePath = line.substring(0, firstColon);
    const absPath = path.resolve(basePath, unformattedFilePath);
    const relativePath = path.relative(basePath, absPath);

    const sLineNumber = line.substring(firstColon + 1, secondColon);
    const lineNumber = parseInt(sLineNumber);

    if (isNaN(lineNumber)) {
      continue;
    }

    const content = line.substring(secondColon + 1);

    grepResults.push({
      filePath: relativePath,
      lineNumber,
      content,
    });
  }

  return grepResults;
}
