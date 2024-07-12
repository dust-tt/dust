import mammoth from "mammoth";
import turndown from "turndown";

import { getWorkerPool } from "@connectors/lib/workerpool";

async function _docx2text(fileContent: Buffer) {
  const converted = await mammoth.convertToHtml({
    buffer: fileContent,
  });

  const result = new turndown()
    .remove(["style", "script", "iframe", "noscript", "form", "img"])
    .turndown(converted.value);

  return result;
}

export async function docx2text(fileContent: Buffer) {
  return getWorkerPool().exec(_docx2text, [fileContent]);
}
