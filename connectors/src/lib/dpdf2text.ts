import { join } from "path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { Readable } from "stream";

interface PDFPage {
  pageNumber: number;
  text: string;
}

async function createPdfTextStream(buffer: Buffer) {
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: join(
      __dirname,
      "../../node_modules/pdfjs-dist/standard_fonts/"
    ),
  });
  const pdf = await loadingTask.promise;

  return new Readable({
    objectMode: true, // Enables stream to handle objects instead of only Buffers or strings.
    async read() {
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const strings = content.items.map((item: unknown) => {
          if (
            item &&
            typeof item === "object" &&
            "str" in item &&
            typeof item.str === "string"
          ) {
            return item.str;
          }
        });

        const pageBlob: PDFPage = {
          pageNumber: pageNum,
          text: strings.join(" "),
        };

        this.push(pageBlob);
      }
      this.push(null);
    },
  });
}

export async function extractTextFromPDF(buffer: Buffer): Promise<PDFPage[]> {
  const pdfTextStream = await createPdfTextStream(buffer);

  const pages: PDFPage[] = [];
  for await (const page of pdfTextStream) {
    pages.push(page);
  }

  return pages;
}
