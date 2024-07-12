import tracer from "dd-trace";
import JSZip from "jszip";
import turndown from "turndown";

type PPTXDocument = {
  pages: {
    content: string;
  }[];
};

export async function PPTX2Text(
  fileBuffer: Buffer,
  filename?: string
): Promise<PPTXDocument> {
  return tracer.trace(
    `PPTX2Text`,
    {
      resource: `PPTX2Text`,
    },
    async (span) => {
      span?.setTag("fileBufferLength", fileBuffer.length);
      span?.setTag("filename", filename);

      const zip = new JSZip();
      await zip.loadAsync(fileBuffer);

      const document: PPTXDocument = {
        pages: [],
      };

      let slideIndex = 1;
      let slideFile: JSZip.JSZipObject | null = null;

      while ((slideFile = zip.file(`ppt/slides/slide${slideIndex}.xml`))) {
        slideIndex++;

        if (!slideFile) {
          break;
        }

        const slideXmlStr = await slideFile.async("text");
        let text: string | null = null;
        try {
          text = new turndown()
            // Add a space character between each paragraph.
            .addRule("paragraph_spacing", {
              filter: (node) => {
                if (node.nodeName === "A:T") {
                  return true;
                }
                return false;
              },
              replacement: function (content) {
                return content + " ";
              },
            })
            .turndown(slideXmlStr);
        } catch (e) {
          console.error(`Failed to extract text from slide ${slideIndex}`);
        }

        if (text) {
          document.pages.push({
            content: text,
          });
        }
      }

      return document;
    }
  );
}
