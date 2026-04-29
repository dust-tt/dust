import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CAT_ACTION_NAME,
  FILES_SERVER_NAME,
  GREP_MATCHES_MAX,
} from "@app/lib/api/actions/servers/files/metadata";
import {
  isReadableAsText,
  resolveConversationFile,
} from "@app/lib/api/actions/servers/files/tools/utils";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import * as readline from "readline";

export async function grepHandler(
  { path, pattern }: { path: string; pattern: string },
  extra: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const resolvedRes = await resolveConversationFile(path, extra);
  if (resolvedRes.isErr()) {
    return resolvedRes;
  }
  const { file, mimeType } = resolvedRes.value;

  if (!isReadableAsText(mimeType)) {
    return new Ok([
      {
        type: "text",
        text:
          `\`${path}\` is not a text file (${mimeType}) ` +
          `and cannot be searched with grep.`,
      },
    ]);
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "m");
  } catch (err) {
    return new Err(
      new MCPError(
        `Invalid regular expression: \`${pattern}\`. Error: ${normalizeError(err).message}`,
        { tracked: false }
      )
    );
  }

  const stream = file.createReadStream();

  const matches: string[] = [];
  let lineNumber = 0;
  let capped = false;

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      lineNumber++;

      if (regex.test(line)) {
        matches.push(`${lineNumber}: ${line}`);

        if (matches.length >= GREP_MATCHES_MAX) {
          capped = true;
          rl.close();
          stream.destroy();
          break;
        }
      }
    }
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to read file \`${path}\`: ${normalizeError(err).message}`
      )
    );
  }

  if (matches.length === 0) {
    return new Ok([
      {
        type: "text",
        text: `No lines matched \`${pattern}\` in \`${path}\`.`,
      },
    ]);
  }

  let text = matches.join("\n");
  if (capped) {
    text += `\n\n[Showing first ${GREP_MATCHES_MAX} matches. Refine your pattern or use \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_CAT_ACTION_NAME)}\` with a line offset to read a specific section.]`;
  } else {
    text += `\n\n[${matches.length} match${matches.length === 1 ? "" : "es"} found]`;
  }

  return new Ok([{ type: "text", text }]);
}
