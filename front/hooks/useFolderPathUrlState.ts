import { useQueryParams } from "@app/hooks/useQueryParams";
import { useCallback } from "react";

// Module-level so the reference passed to `useQueryParams` stays stable.
const FOLDER_PATH_PARAMS: ["path"] = ["path"];

export function useFolderPathUrlState(): [string, (path: string) => void] {
  const { path: folderPath } = useQueryParams(FOLDER_PATH_PARAMS);

  const setPath = useCallback(
    (newPath: string) =>
      folderPath.setParam(newPath === "" ? undefined : newPath),
    [folderPath]
  );

  return [folderPath.value ?? "", setPath];
}
