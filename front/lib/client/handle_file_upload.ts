import type { Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
// @ts-expect-error: type package doesn't load properly because of how we are loading pdfjs
import * as PDFJS from "pdfjs-dist/build/pdf";
PDFJS.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.mjs`;

const supportedFileExtensions = [".txt", ".pdf", ".md", ".csv", ".tsv"];

export async function handleFileUploadToText(
  file: File
): Promise<
  Result<{ title: string; content: string; contentType: string }, Error>
> {
  return new Promise((resolve) => {
    const handleFileLoadedText = (e: ProgressEvent<FileReader>) => {
      const content = e.target?.result;
      if (content && typeof content === "string") {
        return resolve(
          new Ok({ title: file.name, content, contentType: file.type })
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
      try {
        const arrayBuffer = e.target?.result;
        if (!(arrayBuffer instanceof ArrayBuffer)) {
          return resolve(
            new Err(
              new Error("Failed extracting text from PDF. Unexpected error")
            )
          );
        }
        const loadingTask = PDFJS.getDocument({ data: arrayBuffer });
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
        return resolve(
          new Ok({
            title: file.name,
            content: text,
            contentType: file.type,
          })
        );
      } catch (e) {
        console.error("Failed extracting text from PDF", e);
        const errorMessage =
          e instanceof Error ? e.message : "Unexpected error";
        return resolve(
          new Err(new Error(`Failed extracting text from PDF. ${errorMessage}`))
        );
      }
    };

    try {
      if (file.type === "application/pdf") {
        const fileReader = new FileReader();
        fileReader.onloadend = handleFileLoadedPDF;
        fileReader.readAsArrayBuffer(file);
      } else if (
        isTextualFile(file) ||
        supportedFileExtensions
          .map((ext) => file.name.endsWith(ext))
          .includes(true)
      ) {
        const fileData = new FileReader();
        fileData.onloadend = handleFileLoadedText;
        fileData.readAsText(file);
      } else if (file.type.startsWith("image/")) {
        console.log("> file.type:", file.type);
        const reader = new FileReader();

        reader.onloadend = () => {
          // TODO: shrink image.
          console.log(">> reader.result:", reader.result);
          const { result } = reader;

          if (typeof result === "string") {
            return resolve(
              new Ok({
                title: file.name,
                // content: result,
                content: "<image>",
                contentType: file.type,
              })
            );
          }

          return resolve(
            new Err(
              new Error("Failed extracting text from image. Unexpected error")
            )
          );
        };

        reader.readAsDataURL(file);
        // reader.read(file);
        // return resolve(
        //   new Ok({
        //     title: file.name,
        //     content: "<image>",
        //     contentType: file.type,
        //   })
        // );
      } else {
        // TODO: Handle file image.
        return resolve(
          new Err(
            new Error(
              "File type not supported. Supported file types: " +
                supportedFileExtensions.join(", ")
            )
          )
        );
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

export function isTextualFile(file: File): boolean {
  return [
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/tsv",
    "text/comma-separated-values",
    "text/tab-separated-values",
  ].includes(file.type);
}
