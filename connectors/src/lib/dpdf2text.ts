import { spawn } from "child_process";

export async function dpdf2text(pdf_path: string): Promise<string> {
  const args: string[] = [];

  args.push("-layout");
  args.push("-enc");
  args.push("UTF-8");
  args.push(pdf_path);
  args.push("-");

  return new Promise((resolve, reject) => {
    const child = spawn("pdftotext", args);

    const stdout = child.stdout;
    const stderr = child.stderr;
    let capturedStdout = "";
    let capturedStderr = "";

    stdout.setEncoding("utf8");
    stderr.setEncoding("utf8");

    stderr.on("data", function (data) {
      capturedStderr += data;
    });

    stdout.on("data", function (data) {
      capturedStdout += data;
    });

    child.on("close", function (code: number) {
      if (code === 0) {
        return resolve(capturedStdout);
      } else {
        return reject(new Error(capturedStderr));
      }
    });
  });
}
