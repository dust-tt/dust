import { getMetronomeContractById } from "@app/lib/metronome/client";
import {
  cancelWorkspaceContractAtPeriodEnd,
  reactivateWorkspaceContract,
} from "@app/lib/metronome/contract_lifecycle";
import { parseMauTiers } from "@app/lib/metronome/mau_sync";
import { hasContractSeatSubscription } from "@app/lib/metronome/seats";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type MetronomeContractSummary = {
  planFamily: "pro" | "enterprise";
  /**
   * MAU tier boundaries parsed from the MAU_TIERS contract custom field.
   * `null` for simple MAU (no tiering) or non-enterprise.
   * Each tier has `start` (inclusive, 1-indexed) and `end` (exclusive, null = unlimited).
   */
  mauTiers: Array<{ start: number; end: number | null }> | null;
  /** ms epoch — set when the contract is scheduled to end (cancellation or fixed term). */
  contractEndingAtMs: number | null;
  /** True if the contract has at least one seat-billed subscription */
  hasSeatSubscription: boolean;
};

export type GetMetronomeContractResponseBody = {
  contract: MetronomeContractSummary | null;
};

type PatchMetronomeContractResponseBody = {
  success: boolean;
};

export const PatchMetronomeContractRequestBody = z.object({
  action: z.enum(["cancel", "reactivate"]),
});

// Mounted at /api/w/:wId/metronome/contract.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetMetronomeContractResponseBody> => {
    const auth = ctx.get("auth");

    const subscription = auth.subscription();
    const owner = auth.workspace();
    if (!subscription || !owner) {
      return ctx.json({ contract: null });
    }

    const { metronomeContractId } = subscription;
    const { metronomeCustomerId } = owner;
    if (!metronomeContractId || !metronomeCustomerId) {
      return ctx.json({ contract: null });
    }

    const contractResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId,
    });
    if (contractResult.isErr()) {
      return apiError(ctx, {
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

    const contractEndingAtMs = contract.ending_before
      ? new Date(contract.ending_before).getTime()
      : null;

    return ctx.json({
      contract: {
        planFamily,
        mauTiers,
        contractEndingAtMs,
        hasSeatSubscription: await hasContractSeatSubscription(contract),
      },
    });
  }
);

app.patch(
  "/",
  ensureIsAdmin(),
  validate("json", PatchMetronomeContractRequestBody),
  async (ctx): HandlerResult<PatchMetronomeContractResponseBody> => {
    const auth = ctx.get("auth");
    const { action } = ctx.req.valid("json");

    switch (action) {
      case "cancel": {
        const result = await cancelWorkspaceContractAtPeriodEnd(auth);
        if (result.isErr()) {
          return apiError(ctx, {
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
          return apiError(ctx, {
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

    return ctx.json({ success: true });
  }
);

export default app;
