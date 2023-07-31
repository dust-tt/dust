declare module "pdf-to-text" {
  export function pdfToText(
    path: string,
    callback: (err: Error, data: string) => void
  ): void;
  export function pdfToText(
    path: string,
    options: { from: number; to: number },
    callback: (err: Error, data: string) => void
  ): void;
}
