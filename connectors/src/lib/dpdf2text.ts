import { spawn } from "child_process";
import tracer from "dd-trace";

export async function dpdf2text(
  pdfPath: string
): Promise<{ pages: string[]; content: string }> {
  return tracer.trace(
    `dpdf2text`,
    {
      resource: `dpdf2text`,
    },
    async (span) => {
      span?.setTag("pdfPath", pdfPath);
      const argsPerPage: string[] = ["-layout", "-enc", "UTF-8", pdfPath, "-"];

      const content = await new Promise<string>((resolve, reject) => {
        const child = spawn("pdftotext", argsPerPage);

        let capturedStdoutPerPage = "";
        let capturedStderrPerPage = "";

        child.stdout.on("data", (data) => {
          capturedStdoutPerPage += data;
        });
        child.stderr.on("data", (data) => {
          capturedStderrPerPage += data;
        });

        child.on("close", (code) => {
          if (code === 0) {
            resolve(capturedStdoutPerPage);
          } else {
            reject(new Error(capturedStderrPerPage));
          }
        });
      });

      // This assumes \f is not used in the PDF content. Checking popper source code (from which
      // pdftotext is derived), it seems that \f is considered to separate pages.
      // To mititage any major risk, we filter out empty pages which may be caused by extraneous \f.
      // From various tests on different PDFs this seems to work well. If we have a really problematic
      // PDF we can expect that upsert will fail because some chunks sections will have less content
      // than their prefix.
      const pages = content
        .split("\f")
        .filter((page) => page.trim().length > 0);

      return { pages, content };
    }
  );
}
