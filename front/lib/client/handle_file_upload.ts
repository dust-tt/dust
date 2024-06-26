import type { Result, SupportedContentFragmentType } from "@dust-tt/types";
import { isSupportedTextContentFragmentType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
// @ts-expect-error: type package doesn't load properly because of how we are loading pdfjs
import * as PDFJS from "pdfjs-dist/build/pdf";

import { getMimeTypeFromFile } from "@app/lib/file";
PDFJS.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.mjs`;

interface FileBlob {
  title: string;
  content: string;
  contentType: SupportedContentFragmentType;
}

export async function extractTextFromPDF(
  file: File,
  blob: FileReader["result"]
): Promise<Result<FileBlob, Error>> {
  try {
    if (!(blob instanceof ArrayBuffer)) {
      return new Err(
        new Error("Failed extracting text from PDF. Unexpected error")
      );
    }

    const loadingTask = PDFJS.getDocument({ data: blob });
    const pdf = await loadingTask.promise;

    let text = "";
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
      text += `Page: ${pageNum}/${pdf.numPages}\n${strings.join(" ")}\n\n`;
    }

    return new Ok({
      title: file.name,
      content: text,
      contentType: "application/pdf",
    });
  } catch (e) {
    console.error("Failed extracting text from PDF", e);
    const errorMessage = e instanceof Error ? e.message : "Unexpected error";

    return new Err(
      new Error(`Failed extracting text from PDF. ${errorMessage}`)
    );
  }
}

export async function handleFileUploadToText(
  file: File
): Promise<Result<FileBlob, Error>> {
  const contentFragmentMimeType = getMimeTypeFromFile(file);
  if (!isSupportedTextContentFragmentType(contentFragmentMimeType)) {
    return new Err(new Error("Unsupported file type."));
  }

  return new Promise((resolve) => {
    const handleFileLoadedText = (e: ProgressEvent<FileReader>) => {
      const content = e.target?.result;
      if (content && typeof content === "string") {
        return resolve(
          new Ok({
            title: file.name,
            content,
            contentType: contentFragmentMimeType,
          })
        );
      } else {
        return resolve(
          new Err(
            new Error(
              "Failed extracting text from file. Please check that your file is not empty."
            )
          )
        );
      }
    };

    const handleFileLoadedPDF = async (e: ProgressEvent<FileReader>) => {
      const { result = null } = e.target ?? {};

      const res = await extractTextFromPDF(file, result);

      return resolve(res);
    };

    try {
      if (contentFragmentMimeType === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onloadend = handleFileLoadedPDF;
        fileReader.readAsArrayBuffer(file);
      } else {
        const fileData = new FileReader();
        fileData.onloadend = handleFileLoadedText;
        fileData.readAsText(file);
      }
    } catch (e) {
      console.error("Error handling file", e);
      const errorMessage = e instanceof Error ? e.message : "Unexpected error";
      return resolve(
        new Err(new Error(`Error handling file. ${errorMessage}`))
      );
    }
  });
}
