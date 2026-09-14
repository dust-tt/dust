import { AutomationTriggersQuerySchema } from "@app/lib/api/analytics/automations/schema";
import { fetchAutomationTriggerIds } from "@app/lib/api/analytics/automations/triggers";
import { resolveConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import { toConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/schema";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

// A bulk action resolves and updates its whole selection in the request, so
// it is capped instead of being run in the background.
export const MAX_BULK_TRIGGERS = 1000;

// Descriptor of a cross-page trigger selection in the automations table:
// either an explicit list of trigger sIds, or "all triggers matching the
// current query" minus explicit exclusions.
export const BulkTriggerSelectionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("ids"),
    triggerIds: z.array(z.string()).min(1).max(MAX_BULK_TRIGGERS),
  }),
  z.object({
    mode: z.literal("all"),
    query: AutomationTriggersQuerySchema,
    excludeTriggerIds: z.array(z.string()).max(MAX_BULK_TRIGGERS),
  }),
]);

export type BulkTriggerSelection = z.infer<typeof BulkTriggerSelectionSchema>;

export async function resolveBulkTriggerSelection(
  auth: Authenticator,
  selection: BulkTriggerSelection
): Promise<
  Result<TriggerResource[], DustError<"limit_reached" | "internal_error">>
> {
  if (selection.mode === "ids") {
    return new Ok(
      await TriggerResource.fetchByIds(auth, [...new Set(selection.triggerIds)])
    );
  }

  const { search, filter, ...periodQuery } = selection.query;
  const period = await resolveConsumptionPeriod(
    auth,
    toConsumptionPeriodInput(periodQuery)
  );
  const idsResult = await fetchAutomationTriggerIds(auth, {
    period,
    search,
    filter,
    // One more than the cap, so an over-sized selection is detected without
    // ranking every trigger in the workspace.
    limit: MAX_BULK_TRIGGERS + selection.excludeTriggerIds.length + 1,
  });
  if (idsResult.isErr()) {
    return new Err(new DustError("internal_error", idsResult.error.message));
  }

  const excluded = new Set(selection.excludeTriggerIds);
  const triggerIds = idsResult.value.filter(
    (triggerId) => !excluded.has(triggerId)
  );
  if (triggerIds.length > MAX_BULK_TRIGGERS) {
    return new Err(
      new DustError(
        "limit_reached",
        `Bulk actions are limited to ${MAX_BULK_TRIGGERS} automations at a time.`
      )
    );
  }

  return new Ok(await TriggerResource.fetchByIds(auth, triggerIds));
}
