/*
 * Portions of this code are derived from Google's Gemini CLI
 * Copyright (c) Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { spawn } from "child_process";
import { EOL } from "os";
import path from "path";

import { normalizeError } from "./errors.js";

interface grepRes {
  filePath: string;
  content: string;
  lineNumber: number;
}

export async function performGrep(
  pattern: string,
  path: string,
  file_pattern?: string
): Promise<string> {
  // recursive, number lines, include filename, no escape needed
  const grepArgs = ["-r", "-n", "-H", "-E"];
  const commonExcludes = [".git", "node_modules", "bower_components"];
  commonExcludes.forEach((dir) => grepArgs.push(`--exclude-dir=${dir}`));
  if (file_pattern) {
    grepArgs.push(`--include=${file_pattern}`);
  }
  grepArgs.push(pattern);
  // TODO: allow options for other paths?
  grepArgs.push(".");

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("grep", grepArgs, {
        cwd: path,
        windowsHide: true,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      const onData = (chunk: Buffer) => stdoutChunks.push(chunk);
      const onStderr = (chunk: Buffer) => {
        const stderrStr = chunk.toString();
        // Suppress common harmless stderr messages
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
        } // No matches
        else {
          if (stderrData) {
            reject(
              new Error(`System grep exited with code ${code}: ${stderrData}`)
            );
          } else {
            resolve("");
          } // Exit code > 1 but no stderr, likely just suppressed errors
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

    return output;
  } catch (grepError: unknown) {
    console.debug(
      `GrepLogic: System grep failed: ${
        normalizeError(grepError).message
      }. Falling back...`
    );
    return "";
  }
}

export function formatGrepRes(unformattedGrep: string, basePath: string) {
  const grepRes: grepRes[] = [];

  let grepLines = unformattedGrep.split(EOL);
  grepLines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const firstColon = line.indexOf(":");
    if (firstColon == -1) {
      return;
    }
    const secondColon = line.indexOf(":", firstColon + 1);
    if (secondColon == -1) {
      return;
    }

    // Handle path formatting
    const unformattedFilePath = line.substring(0, firstColon);
    const absPath = path.resolve(basePath, unformattedFilePath);
    const relativePath = path.relative(basePath, absPath);

    // Handle line number formatting
    const sLineNumber = line.substring(firstColon + 1, secondColon);
    const lineNumber = parseInt(sLineNumber);

    if (isNaN(lineNumber)) {
      return;
    }

    // Handle content formatting
    const content = line.substring(secondColon + 1);

    grepRes.push({
      filePath: relativePath,
      lineNumber: lineNumber,
      content: content,
    });
  });

  return grepRes;
}
