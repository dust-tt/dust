import type {
  CheckHistoryRun,
  CheckSummary,
} from "@app/types/production_checks";

export type GetProductionChecksResponseBody = {
  checks: CheckSummary[];
};

export type GetCheckHistoryResponseBody = {
  runs: CheckHistoryRun[];
};
