import { useFrontContext } from "@extension/front/providers/FrontProvider";
import { FrontCaptureService } from "@extension/front/services/capture";
import React from "react";

export const useCaptureService = () => {
  const frontContext = useFrontContext();

  if (!frontContext) {
    return null;
  }

  return React.useMemo(
    () => new FrontCaptureService(frontContext),
    [frontContext]
  );
};
