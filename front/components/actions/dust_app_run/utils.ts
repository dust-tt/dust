import type { ModelId, SupportedFileContentType } from "@app/types";
import { extensionsForContentType } from "@app/types/files";

export function getDustAppRunResultsFileTitle({
  appName,
  resultsFileContentType,
}: {
  appName: string;
  resultsFileContentType: SupportedFileContentType;
}): string {
  const extensions = extensionsForContentType(resultsFileContentType);
  let title = `${appName}_output`;
  if (extensions.length > 0) {
    title += extensions[0];
  }
  return title;
}

// TODO Daph refactor this we could simplify this.
export type DustAppRunConfigurationType = {
  id: ModelId;
  sId: string;

  type: "dust_app_run_configuration";

  appWorkspaceId: string;
  appId: string;

  name: string;
  description: string | null;
};
