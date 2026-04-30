import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { CAT_LINES_DEFAULT } from "@app/lib/api/actions/servers/files/metadata";
import {
  isReadableAsText,
  resolveConversationFile,
} from "@app/lib/api/actions/servers/files/tools/utils";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { File as GCSFile } from "@google-cloud/storage";
import * as readline from "readline";

async function catText(
  file: GCSFile,
  path: string,
  startLine: number,
  maxLines: number
): Promise<ToolHandlerResult> {
  const lines: string[] = [];
  let lineNumber = 0;
  let byteCount = 0;
  let byteCapped = false;
  let totalLines = 0;

  const stream = file.createReadStream();
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      lineNumber++;

      if (lineNumber < startLine) {
        continue;
      }

      totalLines++;

      const lineWithNumber = `${lineNumber}: ${line}`;
      const lineBytes = Buffer.byteLength(lineWithNumber + "\n", "utf8");

      if (byteCount + lineBytes > FILE_OFFLOAD_TEXT_SIZE_BYTES) {
        byteCapped = true;
        break;
      }

      lines.push(lineWithNumber);
      byteCount += lineBytes;

      if (totalLines >= maxLines) {
        break;
      }
    }
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to read file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  }

  rl.close();

  if (lines.length === 0) {
    if (startLine > 1) {
      return new Ok([
        {
          type: "text",
          text: `No lines found at offset ${startLine} in \`${path}\`.`,
        },
      ]);
    }
    return new Ok([{ type: "text", text: `\`${path}\` is empty.` }]);
  }

  const endLine = startLine + lines.length - 1;

  let text = lines.join("\n");
  if (byteCapped) {
    const kb = FILE_OFFLOAD_TEXT_SIZE_BYTES / 1024;
    text +=
      `\n\n[Truncated at ${kb}KB. Showing lines ${startLine}-${endLine}.` +
      ` Use offset=${endLine + 1} to read more.]`;
  } else if (totalLines >= maxLines) {
    text += `\n\n[Showing lines ${startLine}-${endLine}. Use offset=${endLine + 1} to read more.]`;
  }

  return new Ok([{ type: "text", text }]);
}

export async function catHandler(
  { path, offset, limit }: { path: string; offset?: number; limit?: number },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const resolvedRes = await resolveConversationFile(
    auth,
    agentLoopContext?.runContext?.conversation,
    path
  );
  if (resolvedRes.isErr()) {
    return resolvedRes;
  }
  // TODO(20260429 FILE SYSTEM) Add image support to cat (return vision content block).
  const { file, mimeType } = resolvedRes.value;

  if (!isReadableAsText(mimeType)) {
    return new Ok([
      {
        type: "text",
        text: `\`${path}\` is a binary file (${mimeType}) and cannot be read as text.`,
      },
    ]);
  }

  return catText(file, path, offset ?? 1, limit ?? CAT_LINES_DEFAULT);
}
