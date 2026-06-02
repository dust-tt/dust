/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { CancelPendingContractErrorKind } from "@app/lib/api/poke/cancel_pending_contract";
import {
  type CancelPendingContractError,
  cancelPendingContract,
} from "@app/lib/api/poke/cancel_pending_contract";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

export interface CancelPendingContractSuccessResponseBody {
  success: boolean;
}

function statusForKind(kind: CancelPendingContractErrorKind): {
  status_code: 400 | 500 | 502;
  type: "invalid_request_error" | "internal_server_error";
} {
  switch (kind) {
    case "invalid_request":
      return { status_code: 400, type: "invalid_request_error" };
    case "restore_failed":
      return { status_code: 502, type: "internal_server_error" };
    case "cleanup_inconsistent":
      return { status_code: 500, type: "internal_server_error" };
    default:
      assertNever(kind);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<CancelPendingContractSuccessResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const plugin = pluginManager.getNonNullablePlugin("cancel-pending-contract");
  const pluginRun = await PluginRunResource.makeNew(
    plugin,
    req.body,
    auth.getNonNullableUser(),
    owner,
    { resourceId: owner.sId, resourceType: "workspaces" }
  );

  const result = await cancelPendingContract({ auth });
  if (result.isErr()) {
    const err: CancelPendingContractError = result.error;
    await pluginRun.recordError(err.message);
    const { status_code, type } = statusForKind(err.kind);
    return apiError(req, res, {
      status_code,
      api_error: { type, message: err.message },
    });
  }

  const { cancelledMetronomeContractId } = result.value;
  await pluginRun.recordResult({
    display: "text",
    value:
      `Cancelled pending contract switch for ${owner.name}. ` +
      (cancelledMetronomeContractId
        ? `Archived Metronome contract ${cancelledMetronomeContractId}. `
        : "") +
      "The current subscription/contract was restored.",
  });
  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForPoke(handler);
