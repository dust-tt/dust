import {
  decodeNativeDocumentSource,
  exportDocumentMarkdown,
  importDocumentMarkdown,
  validateNativeDocument,
} from "@app/lib/api/documents/content";
import { DOCUMENT_MAX_BYTES } from "@app/types/documents";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { createReadStream } from "fs";
import { writeFile } from "fs/promises";

const readSource = async (filePath: string): Promise<string> => {
  const chunks: Buffer[] = [];
  // Read at most one byte beyond the limit, even if the file grows during the check.
  for await (const chunk of createReadStream(filePath, {
    end: DOCUMENT_MAX_BYTES,
  })) {
    chunks.push(Buffer.from(chunk));
  }
  const source = decodeNativeDocumentSource(Buffer.concat(chunks));
  if (source.isErr()) {
    throw source.error;
  }
  return source.value;
};

/**
 * @cc [owner:flvndvd,label:security] document-checker-data-only
 * Checking MUST bound input before parsing and MUST NOT modify or execute it.
 * Conversion MUST validate the complete output before creating a new file and
 * MUST NOT overwrite an existing destination or discard unsupported content.
 */
const main = async (args: string[]): Promise<void> => {
  const [command, sourcePath, outputPath] = args;
  if (args.length === 1 && command && !command.startsWith("--")) {
    const result = validateNativeDocument(await readSource(command));
    if (result.isErr()) {
      throw new Error(`${command}: ${result.error.message}`);
    }
    process.stdout.write(`${command}: valid Dust document\n`);
    return;
  }

  if (
    args.length !== 3 ||
    !sourcePath ||
    !outputPath ||
    (command !== "--from-markdown" && command !== "--to-markdown")
  ) {
    throw new Error(
      "Usage: node check.mjs <document.dustdoc>\n" +
        "       node check.mjs --from-markdown <source.md> <new-document.dustdoc>\n" +
        "       node check.mjs --to-markdown <document.dustdoc> <new-output.md>"
    );
  }

  const source = await readSource(sourcePath);
  let output: string;
  if (command === "--from-markdown") {
    const document = importDocumentMarkdown(source);
    if (!document) {
      throw new Error(
        `${sourcePath}: Markdown cannot be imported without losing content or exceeding the size limit.`
      );
    }
    output = `${JSON.stringify(document, null, 2)}\n`;
    const validated = validateNativeDocument(output);
    if (validated.isErr()) {
      throw new Error(`${sourcePath}: ${validated.error.message}`);
    }
  } else {
    const validated = validateNativeDocument(source);
    if (validated.isErr()) {
      throw new Error(`${sourcePath}: ${validated.error.message}`);
    }
    const markdown = exportDocumentMarkdown(validated.value);
    if (markdown === null) {
      throw new Error(
        `${sourcePath}: This document cannot be exported to Markdown without losing content.`
      );
    }
    output = markdown;
  }

  await writeFile(outputPath, output, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`${outputPath}: created\n`);
};

void main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${normalizeError(error).message}\n`);
  process.exitCode = 1;
});
