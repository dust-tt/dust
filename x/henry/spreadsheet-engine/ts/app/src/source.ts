/** What the viewer is currently showing and where it came from. The `src`
 * object identity drives `useDustSheetController` reloads, so a new object is
 * created per open action. */
export interface SheetSource {
  kind: "sample" | "file" | "url";
  fileName: string;
  src: { url: string; headers?: Record<string, string> } | { bytes: ArrayBuffer };
}
