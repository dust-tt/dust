import {
  FILE_OFFLOAD_SNIPPET_LENGTH,
  FILE_OFFLOAD_TEXT_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
import type { SearchResultResourceType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { ToolRunContext } from "@app/lib/actions/types";
import { writeToToolOutputsFolder } from "@app/lib/api/files/action_output_fs";
import { makeFileName } from "@app/lib/api/files/action_output_fs/naming";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

// Same separator rewriteContentForModel uses when joining chunks for the model, so the archived
// file reads like the inline rendering would have.
const CHUNK_SEPARATOR = "\n------------\n";

/**
 * Offloads the chunks of search results that exceed the text offload threshold: the full chunks
 * are archived to the run context's .tool_outputs folder and replaced inline with a truncated
 * snippet pointing at the archived file. Results under the threshold are returned unchanged.
 * Result metadata (ref, uri, title, tags) always stays inline so citations are unaffected.
 */
export async function offloadLargeSearchResultChunks(
  auth: Authenticator,
  runContext: ToolRunContext,
  results: SearchResultResourceType[]
): Promise<SearchResultResourceType[]> {
  return concurrentExecutor(
    results,
    async (result) => {
      const content = result.chunks.join(CHUNK_SEPARATOR);
      if (Buffer.byteLength(content, "utf8") <= FILE_OFFLOAD_TEXT_SIZE_BYTES) {
        return result;
      }

      const fileName = makeFileName({
        name: result.text || "search-result",
        ext: ".txt",
      });
      const writeResult = await writeToToolOutputsFolder(auth, runContext, {
        fileName,
        content,
        contentType: "text/plain",
      });

      // A failed archive must not fail the search: keep the result inline.
      if (writeResult.isErr()) {
        logger.error(
          { error: writeResult.error, fileName },
          "Failed to offload search result chunks"
        );
        return result;
      }

      const snippet = `${content.substring(0, FILE_OFFLOAD_SNIPPET_LENGTH)}... (truncated)\n[Full content archived at ${writeResult.value}]`;
      return { ...result, chunks: [snippet] };
    },
    { concurrency: 4 }
  );
}
