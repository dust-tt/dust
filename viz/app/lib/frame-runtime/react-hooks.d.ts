// Type contract of the `@dust/react-hooks` module Frames import at runtime. VisualizationWrapper
// checks the runtime object it builds against this file, and the Frame runtime types artifact
// ships it to publication type checking, so the two cannot drift.
export { SandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
export {
  usePodFunction,
  usePodFunctionMutation,
  useUserIdentity,
} from "@viz/app/lib/pod-function-hooks";

export declare function callFunction(
  functionId: string,
  input?: unknown
): Promise<unknown>;

export declare function captureScreenshot(name?: string): Promise<void>;

export declare function triggerUserFileDownload(input: {
  content: string | Blob;
  filename?: string;
}): Promise<void>;

export declare function useFile(fileId: string): File | null;
