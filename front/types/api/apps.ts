import type { AppType, SpecificationType } from "@app/types/app";
import type { RunType } from "@app/types/run";

export type GetAppsResponseBody = {
  apps: AppType[];
};

export type PostAppResponseBody = {
  app: AppType;
};

export type GetOrPostAppResponseBody = {
  app: AppType;
};

export type GetRunsResponseBody = {
  runs: RunType[];
  total: number;
};

export type PostRunsResponseBody = {
  run: RunType;
};

export type GetRunResponseBody = {
  run: RunType;
  spec: SpecificationType;
};

export type GetRunBlockResponseBody = {
  run: RunType | null;
};

export type PostRunCancelResponseBody = {
  success: boolean;
};

export type GetRunStatusResponseBody = {
  run: RunType | null;
};
