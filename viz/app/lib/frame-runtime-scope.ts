import { SandboxFunctionCallError } from "@viz/app/lib/data-apis/sandbox-function-call-error";
import {
  useFrameFunction,
  useFrameFunctionMutation,
  useUserIdentity,
} from "@viz/app/lib/frame-function-hooks";
import type { FrameRuntimeImportName } from "@viz/app/lib/frame-runtime-imports";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type { WriteFileParams } from "@viz/app/types";
import * as dustSlideshowV1 from "@viz/components/dust/slideshow/v1";
import * as dustSlideshowV2 from "@viz/components/dust/slideshow/v2";
import * as shadcn from "@viz/components/ui";
import * as utils from "@viz/lib/utils";
import * as lucide from "lucide-react";
import * as motion from "motion/react";
import * as papaparse from "papaparse";
import * as react from "react";
import * as recharts from "recharts";

/**
 * @cc [owner:flvndvd,label:product] frame-runtime-type-surface
 * Every library exposed to Frame source MUST be returned here. Generated runtime declarations
 * MUST derive module names and bound hook signatures from this function's return type.
 */
export function createFrameRuntimeImports({
  dataAPI,
  captureScreenshot,
  triggerUserFileDownload,
  useFile,
}: {
  dataAPI: VisualizationDataAPI;
  captureScreenshot: (name?: string) => Promise<void>;
  triggerUserFileDownload: (params: {
    content: string | Blob;
    filename?: string;
  }) => Promise<void>;
  useFile: (fileId: string) => File | null;
}) {
  return {
    papaparse,
    react,
    recharts,
    shadcn,
    utils,
    "@viz/lib/utils": utils,
    "lucide-react": lucide,
    "motion/react": motion,
    "@dust/slideshow/v1": dustSlideshowV1,
    "@dust/slideshow/v2": dustSlideshowV2,
    "@dust/react-hooks": {
      SandboxFunctionCallError,
      callFunction: (functionId: string, input?: unknown) =>
        dataAPI.callFunction(functionId, input),
      captureScreenshot,
      triggerUserFileDownload,
      useFile,
      readFile: (path: string) => dataAPI.fetchFile(path),
      writeFile: (
        path: string,
        content: string,
        options: Pick<WriteFileParams, "revision" | "contentType">
      ) => dataAPI.writeFile({ ...options, path, content }),
      useFrameFunction,
      useFrameFunctionMutation,
      // Previously published Frames still import these names.
      usePodFunction: useFrameFunction,
      usePodFunctionMutation: useFrameFunctionMutation,
      useUserIdentity,
    },
  } satisfies Record<FrameRuntimeImportName, unknown>;
}
