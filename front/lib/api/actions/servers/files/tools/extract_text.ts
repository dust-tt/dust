import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolGeneratedFilePathType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDustFileSystemForAgentLoop,
  requireAgentLoopConversation,
  scopedPathsFromArgs,
} from "@app/lib/api/actions/servers/files/tools/agent_loop_fs";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import {
  isTextExtractionSupportedContentType,
  TextExtraction,
} from "@app/types/shared/text_extraction";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { basename, dirname, extname } from "path";

function deriveExtractedPath(sourcePath: string): string {
  const stem = basename(sourcePath, extname(sourcePath));
  return `${dirname(sourcePath)}/${stem}.extracted.txt`;
}

export async function extractTextHandler(
  { path }: { path: string },
  { auth, agentLoopContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const conversationRes = requireAgentLoopConversation({ agentLoopContext });
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const fsResult = await getDustFileSystemForAgentLoop(
    auth,
    conversationRes.value,
    scopedPathsFromArgs(path)
  );
  if (fsResult.isErr()) {
    return fsResult;
  }

  const dustFs = fsResult.value;

  const statResult = await dustFs.stat(path);
  if (statResult.isErr()) {
    return new Err(new MCPError(statResult.error.message, { tracked: false }));
  }

  if (statResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  const { contentType } = statResult.value;

  if (!isTextExtractionSupportedContentType(contentType)) {
    return new Err(
      new MCPError(
        `\`${contentType}\` is not supported for text extraction. Supported formats: PDF, DOCX, DOC, PPTX, PPT, XLSX, XLS.`,
        { tracked: false }
      )
    );
  }

  const readResult = await dustFs.read(path);
  if (readResult.isErr()) {
    return new Err(new MCPError(readResult.error.message, { tracked: false }));
  }

  if (readResult.value === null) {
    return new Err(
      new MCPError(`File not found: \`${path}\`.`, { tracked: false })
    );
  }

  let extractedStream;
  try {
    extractedStream = await new TextExtraction(config.getTextExtractionUrl(), {
      enableOcr: true,
      logger,
    }).fromStream(readResult.value, contentType);
  } catch (err) {
    return new Err(
      new MCPError(`Text extraction failed: ${normalizeError(err).message}`, {
        tracked: true,
      })
    );
  }

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of extractedStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch (err) {
    return new Err(
      new MCPError(
        `Failed to read extracted content: ${normalizeError(err).message}`,
        { tracked: true }
      )
    );
  }

  const extractedContent = Buffer.concat(chunks);
  const outputPath = deriveExtractedPath(path);

  const writeResult = await dustFs.write(
    outputPath,
    extractedContent,
    "text/plain"
  );
  if (writeResult.isErr()) {
    return new Err(
      new MCPError(
        `Failed to write extracted text to \`${outputPath}\`: ${writeResult.error.message}`
      )
    );
  }

  const fileName = outputPath.split("/").pop() ?? outputPath;
  const sizeKb = Math.ceil(extractedContent.byteLength / 1024);

  const filePathResource: ToolGeneratedFilePathType = {
    text: `Extracted text from \`${path}\``,
    uri: outputPath,
    mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.FILE_PATH,
    path: outputPath,
    title: fileName,
    contentType: "text/plain",
  };

  return new Ok([
    {
      type: "text",
      text: `Extracted text from \`${path}\` to \`${outputPath}\` (${sizeKb} KB). The user is presented with an attachment to download the file, do not attempt to generate a link to it.`,
    },
    {
      type: "resource",
      resource: filePathResource,
    },
  ]);
}
