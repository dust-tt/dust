import { useQueryParams } from "@app/hooks/useQueryParams";
import { useCallback } from "react";

// Module-level so the reference passed to `useQueryParams` stays stable.
const FOLDER_PATH_PARAMS: ["folderPath"] = ["folderPath"];

export function useFolderPathUrlState(): [string, (path: string) => void] {
  const { folderPath } = useQueryParams(FOLDER_PATH_PARAMS);

  const setPath = useCallback(
    (path: string) => folderPath.setParam(path === "" ? undefined : path),
    [folderPath]
  );

  return [folderPath.value ?? "", setPath];
}
