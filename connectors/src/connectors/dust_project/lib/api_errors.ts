import type { Logger } from "@connectors/logger/logger";
import type { APIError, Result } from "@dust-tt/client";

export type DustProjectSyncActivityResult = {
  skippedDueToWorkspaceApiAccess: boolean;
};

export const DUST_PROJECT_SYNC_COMPLETED: DustProjectSyncActivityResult = {
  skippedDueToWorkspaceApiAccess: false,
};

export type DustApiCallResult<T> =
  | { skipped: false; value: T }
  | { skipped: true; skipResult: DustProjectSyncActivityResult };

export function isWorkspaceCanUseProductRequiredError(
  error: APIError
): boolean {
  return error.type === "workspace_can_use_product_required_error";
}

/**
 * When the target workspace plan disallows API access, log and signal that
 * the sync should be skipped without failing the connector workflow.
 */
export function skipSyncDueToWorkspaceApiAccess({
  logger,
  error,
  projectId,
  workspaceId,
}: {
  logger: Logger;
  error: APIError;
  projectId: string;
  workspaceId: string;
}): DustProjectSyncActivityResult {
  logger.warn(
    {
      projectId,
      workspaceId,
      errorType: error.type,
      errorMessage: error.message,
    },
    "Workspace plan does not allow API access, skipping dust_project sync"
  );
  return { skippedDueToWorkspaceApiAccess: true };
}

/**
 * Parses a Dust API result, returning a skip marker when the workspace plan
 * disallows API access, or throwing for other errors.
 */
export function parseDustApiResult<T>({
  result,
  logger,
  projectId,
  workspaceId,
  errorPrefix,
}: {
  result: Result<T, APIError>;
  logger: Logger;
  projectId: string;
  workspaceId: string;
  errorPrefix: string;
}): DustApiCallResult<T> {
  if (result.isOk()) {
    return { skipped: false, value: result.value };
  }

  if (isWorkspaceCanUseProductRequiredError(result.error)) {
    return {
      skipped: true,
      skipResult: skipSyncDueToWorkspaceApiAccess({
        logger,
        error: result.error,
        projectId,
        workspaceId,
      }),
    };
  }

  throw new Error(`${errorPrefix}: ${result.error.message}`);
}
