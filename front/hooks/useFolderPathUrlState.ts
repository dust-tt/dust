import { useQueryParams } from "@app/hooks/useQueryParams";
import { useMemo } from "react";

export function useFolderPathUrlState(
  paramKey: string
): [string, (path: string) => void] {
  const paramNames = useMemo(() => [paramKey], [paramKey]);
  const params = useQueryParams(paramNames);
  const param = params[paramKey];

  const setPath = (path: string) =>
    param.setParam(path === "" ? undefined : path);

  return [param.value ?? "", setPath];
}
