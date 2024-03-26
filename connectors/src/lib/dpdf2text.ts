import { spawn } from "child_process";

export async function dpdf2text(
  pdfPath: string
): Promise<{ pages: { [pageNumber: string]: string }; content: string }> {
  const pages: { [pageNumber: number]: string } = {};
  let content = "";

  let currentPage: number | null = 1;
  while (currentPage !== null) {
    const argsPerPage: string[] = [
      "-layout",
      "-enc",
      "UTF-8",
      "-f",
      `${currentPage}`,
      "-l",
      `${currentPage}`,
      pdfPath,
      "-",
    ];

    const pageText = await new Promise<string | null>((resolve, reject) => {
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
          if (capturedStderrPerPage.includes("Wrong page range given")) {
            resolve(null);
          } else {
            currentPage = null;
            reject(new Error(capturedStderrPerPage));
          }
        }
      });
    });

    if (pageText === null) {
      currentPage = null;
    } else {
      pages[currentPage] = pageText;
      // Pages are generally separated by `\f` (form feed), so we can just concatenate here.
      content += pageText;
      currentPage++;
    }
  }

  return { pages, content };
}
