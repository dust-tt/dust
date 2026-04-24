/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import {
  cancelWorkspaceContractAtPeriodEnd,
  reactivateWorkspaceContract,
} from "@app/lib/metronome/contract_lifecycle";
import { parseMauTiers } from "@app/lib/metronome/mau_sync";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export type MetronomeContractSummary = {
  planFamily: "pro" | "enterprise";
  /**
   * MAU tier boundaries parsed from the MAU_TIERS contract custom field.
   * `null` for simple MAU (no tiering) or non-enterprise.
   * Each tier has `start` (inclusive, 1-indexed) and `end` (exclusive, null = unlimited).
   */
  mauTiers: Array<{ start: number; end: number | null }> | null;
  /** ms epoch — set when the contract is scheduled to end (cancellation or fixed term). */
  contractEndingAt: number | null;
};

export type GetMetronomeContractResponseBody = {
  contract: MetronomeContractSummary | null;
};

type PatchMetronomeContractResponseBody = {
  success: boolean;
};

export const PatchMetronomeContractRequestBody = t.type({
  action: t.union([t.literal("cancel"), t.literal("reactivate")]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetMetronomeContractResponseBody | PatchMetronomeContractResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      return handleGet(req, res, auth);
    case "PATCH":
      return handlePatch(req, res, auth);
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or PATCH is expected.",
        },
      });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeContractResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const subscription = auth.subscription();
  const owner = auth.workspace();
  if (!subscription || !owner) {
    return res.status(200).json({ contract: null });
  }

  const { metronomeContractId } = subscription;
  const { metronomeCustomerId } = owner;
  if (!metronomeContractId || !metronomeCustomerId) {
    return res.status(200).json({ contract: null });
  }

  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    return apiError(req, res, {
      status_code: 502,
      api_error: {
        type: "internal_server_error",
        message: `Failed to fetch Metronome contract: ${contractResult.error.message}`,
      },
    });
  }

  const contract = contractResult.value;

  const planFamily: "pro" | "enterprise" = isEntreprisePlanPrefix(
    subscription.plan.code
  )
    ? "enterprise"
    : "pro";

  const mauTiersField = contract.custom_fields?.MAU_TIERS;
  const parsed = parseMauTiers(mauTiersField);
  const mauTiers = parsed
    ? parsed.map((t) => ({ start: t.start, end: t.end ?? null }))
    : null;

  const contractEndingAt = contract.ending_before
    ? new Date(contract.ending_before).getTime()
    : null;

  return res.status(200).json({
    contract: {
      planFamily,
      mauTiers,
      contractEndingAt,
    },
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchMetronomeContractResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const bodyValidation = PatchMetronomeContractRequestBody.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const { action } = bodyValidation.right;

  switch (action) {
    case "cancel": {
      const result = await cancelWorkspaceContractAtPeriodEnd(auth);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: result.error.kind === "invalid_state" ? 400 : 502,
          api_error: {
            type:
              result.error.kind === "invalid_state"
                ? "subscription_state_invalid"
                : "internal_server_error",
            message: result.error.message,
          },
        });
      }
      break;
    }
    case "reactivate": {
      const result = await reactivateWorkspaceContract(auth);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: result.error.kind === "invalid_state" ? 400 : 502,
          api_error: {
            type:
              result.error.kind === "invalid_state"
                ? "subscription_state_invalid"
                : "internal_server_error",
            message: result.error.message,
          },
        });
      }
      break;
    }
    default:
      assertNever(action);
  }

  return res.status(200).json({ success: true });
}

export default withSessionAuthenticationForWorkspace(handler);
