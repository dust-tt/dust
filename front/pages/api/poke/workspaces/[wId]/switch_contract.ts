/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import type { SwitchContractErrorKind } from "@app/lib/api/poke/switch_contract";
import {
  SwitchContractBodySchema,
  type SwitchContractError,
  switchContract,
} from "@app/lib/api/poke/switch_contract";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

export interface SwitchContractSuccessResponseBody {
  success: boolean;
}

function statusForKind(kind: SwitchContractErrorKind): {
  status_code: 400 | 500 | 502;
  type: "invalid_request_error" | "internal_server_error";
} {
  switch (kind) {
    case "invalid_request":
      return { status_code: 400, type: "invalid_request_error" };
    case "metronome_api_error":
    case "provision_inconsistent":
      return { status_code: 502, type: "internal_server_error" };
    case "payg_config_failed":
      return { status_code: 500, type: "internal_server_error" };
    default:
      assertNever(kind);
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SwitchContractSuccessResponseBody>>,
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

  const plugin = pluginManager.getNonNullablePlugin("switch-contract");
  const pluginRun = await PluginRunResource.makeNew(
    plugin,
    req.body,
    auth.getNonNullableUser(),
    owner,
    { resourceId: owner.sId, resourceType: "workspaces" }
  );

  const validation = SwitchContractBodySchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = `The request body is invalid: ${fromError(validation.error).toString()}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }
  const body = validation.data;

  const result = await switchContract({ auth, body });
  if (result.isErr()) {
    const err: SwitchContractError = result.error;
    await pluginRun.recordError(err.message);
    const { status_code, type } = statusForKind(err.kind);
    return apiError(req, res, {
      status_code,
      api_error: { type, message: err.message },
    });
  }

  const { metronomeContractId } = result.value;
  const paygStatus = body.paygEnabled
    ? ` PAYG enabled with a ${body.paygCapCredits} credit cap.`
    : "";
  await pluginRun.recordResult({
    display: "text",
    value:
      `Workspace ${owner.name} scheduled to switch to plan ${body.planCode} ` +
      `(Metronome contract ${metronomeContractId}). Subscription will flip ` +
      `when the contract.start webhook fires.${paygStatus}`,
  });
  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForPoke(handler);
