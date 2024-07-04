import tracer from "dd-trace";
import mammoth from "mammoth";
import turndown from "turndown";

import { getWorkerPool } from "@connectors/lib/workerpool";

async function _docx2text(fileContent: Buffer, filename: string) {
  return tracer.trace(
    `gdrive`,
    {
      resource: `syncOneFile`,
    },
    async (span) => {
      span?.setTag("filename", filename);
      span?.setTag("fileContent.length", fileContent.length);

      const converted = await mammoth.convertToHtml({
        buffer: fileContent,
      });
      const result = new turndown()
        .remove(["style", "script", "iframe", "noscript", "form", "img"])
        .turndown(converted.value);

      return result;
    }
  );
}

export async function docx2text(fileContent: Buffer, filename: string) {
  return getWorkerPool().exec(_docx2text, [fileContent, filename]);
}
