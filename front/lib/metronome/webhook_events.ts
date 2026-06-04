// Zod schemas for Metronome webhook events.
//
// The Metronome SDK's `webhooks.unwrap()` only verifies the signature and
// JSON-parses the body — it returns `Object` with no event-type discrimination.
// These schemas validate the payload and produce a typed discriminated union.
//
// Per Metronome docs, the wire format may add new fields without notice, so
// extra/unknown properties are accepted. Unknown event types are surfaced via
// `safeParse` failure at the call site (handler should log + ack with 200).
//
// Reference: https://docs.metronome.com/api/webhooks
import { z } from "zod";

const customFieldsSchema = z.record(z.string(), z.string()).nullish();

// ============================================================================
// Threshold notifications (alerts.*) — payload uses a `properties` wrapper.
// ============================================================================

// Only `customer_id` is required — every other alert field is omitted in some
// real payloads (e.g. `triggered_by` missing on `spend_threshold_reached`),
// and we only consume `customer_id` (the rest is logged).
const baseAlertPropertiesSchema = z.object({
  customer_id: z.string(),
  alert_id: z.string().nullish(),
  timestamp: z.string().nullish(),
  threshold: z.number().nullish(),
  alert_name: z.string().nullish(),
  triggered_by: z.string().nullish(),
});

// Metronome fires a `_resolved` companion to every `_reached` alert when the
// underlying condition clears (e.g. balance climbs back above zero after a
// top-up, or current_spend drops below threshold at a new billing cycle).
// Resolved payloads share the same shape as their reached counterpart; the
// only differences are the `type` discriminator and that the relevant balance
// / spend value is typically on the safe side of the threshold.

// alerts.low_remaining_credit_balance_*
const lowRemainingCreditBalanceProps = baseAlertPropertiesSchema.extend({
  credit_type_id: z.string().nullish(),
  remaining_balance: z.number().nullish(),
});
const LowRemainingCreditBalanceReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_credit_balance_reached"),
  properties: lowRemainingCreditBalanceProps,
});
const LowRemainingCreditBalanceResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_credit_balance_resolved"),
  properties: lowRemainingCreditBalanceProps,
});

// alerts.spend_threshold_*
const spendThresholdProps = baseAlertPropertiesSchema.extend({
  current_spend: z.number().nullish(),
  credit_type_id: z.string().nullish(),
  invoice_type: z.string().nullish(),
  group_values: z
    .array(
      z.object({
        key: z.string(),
        value: z.string().nullish(),
      })
    )
    .nullish(),
});
const SpendThresholdReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.spend_threshold_reached"),
  properties: spendThresholdProps,
});
const SpendThresholdResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.spend_threshold_resolved"),
  properties: spendThresholdProps,
});

// alerts.low_remaining_commit_balance_*
const lowRemainingCommitBalanceProps = baseAlertPropertiesSchema.extend({
  commit_id: z.string().nullish(),
  remaining_balance: z.number().nullish(),
});
const LowRemainingCommitBalanceReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_commit_balance_reached"),
  properties: lowRemainingCommitBalanceProps,
});
const LowRemainingCommitBalanceResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_commit_balance_resolved"),
  properties: lowRemainingCommitBalanceProps,
});

// alerts.low_remaining_contract_credit_balance_*
// Contract-level credit balance — fires for credits attached to a contract
// (e.g. the recurring `Free Usage Credits (AWU)` credit). Not in the public
// webhook docs but present in the UI's sample payload, distinct from
// `alerts.low_remaining_credit_balance_*` (customer-level credits).
const lowRemainingContractCreditBalanceProps = baseAlertPropertiesSchema.extend(
  {
    contract_id: z.string().nullish(),
    credit_id: z.string().nullish(),
    credit_type_id: z.string().nullish(),
    remaining_balance: z.number().nullish(),
  }
);
const LowRemainingContractCreditBalanceReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_contract_credit_balance_reached"),
  properties: lowRemainingContractCreditBalanceProps,
});
const LowRemainingContractCreditBalanceResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_contract_credit_balance_resolved"),
  properties: lowRemainingContractCreditBalanceProps,
});

// alerts.low_remaining_contract_credit_and_commit_balance_*
// Combined alert: fires when the SUM of remaining contract credits and commit
// balance reaches the threshold. This is the canonical "user can no longer
// spend" signal for Enterprise Pooled — `low_remaining_commit_balance_*`
// fires too early when free contract credits remain.
const lowRemainingContractCreditAndCommitBalanceProps =
  baseAlertPropertiesSchema.extend({
    contract_id: z.string().nullish(),
    credit_type_id: z.string().nullish(),
    remaining_balance: z.number().nullish(),
  });
const LowRemainingContractCreditAndCommitBalanceReachedSchema = z.object({
  id: z.string(),
  type: z.literal(
    "alerts.low_remaining_contract_credit_and_commit_balance_reached"
  ),
  properties: lowRemainingContractCreditAndCommitBalanceProps,
});
const LowRemainingContractCreditAndCommitBalanceResolvedSchema = z.object({
  id: z.string(),
  type: z.literal(
    "alerts.low_remaining_contract_credit_and_commit_balance_resolved"
  ),
  properties: lowRemainingContractCreditAndCommitBalanceProps,
});

// alerts.usage_threshold_*
const usageThresholdProps = baseAlertPropertiesSchema.extend({
  billable_metric_id: z.string().nullish(),
  current_usage: z.number().nullish(),
});
const UsageThresholdReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.usage_threshold_reached"),
  properties: usageThresholdProps,
});
const UsageThresholdResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.usage_threshold_resolved"),
  properties: usageThresholdProps,
});

// alerts.invoice_total_*
const invoiceTotalProps = baseAlertPropertiesSchema.extend({
  invoice_id: z.string().nullish(),
  invoice_total: z.number().nullish(),
});
const InvoiceTotalReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.invoice_total_reached"),
  properties: invoiceTotalProps,
});
const InvoiceTotalResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.invoice_total_resolved"),
  properties: invoiceTotalProps,
});

// alerts.low_remaining_seat_balance_*
// Undocumented in the public webhook docs but emitted today.
const lowRemainingSeatBalanceProps = baseAlertPropertiesSchema.extend({
  remaining_balance: z.number().nullish(),
  seat_filter: z
    .object({
      seat_group_key: z.string(),
      value: z.string().nullish(),
    })
    .nullish(),
});
const LowRemainingSeatBalanceReachedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_seat_balance_reached"),
  properties: lowRemainingSeatBalanceProps,
});
const LowRemainingSeatBalanceResolvedSchema = z.object({
  id: z.string(),
  type: z.literal("alerts.low_remaining_seat_balance_resolved"),
  properties: lowRemainingSeatBalanceProps,
});

// ============================================================================
// System notifications — flat payload. Offset notifications share the same
// shape with optional `offset_id` / `offset_duration` fields, so they are
// merged into the contract event schemas below.
// ============================================================================

const offsetFieldsSchema = z.object({
  offset_id: z.string().optional(),
  offset_duration: z.string().optional(),
});

const baseContractEventSchema = z
  .object({
    id: z.string(),
    timestamp: z.string(),
    environment_type: z.string().optional(),
    contract_id: z.string(),
    contract_custom_fields: customFieldsSchema,
    customer_id: z.string(),
    customer_custom_fields: customFieldsSchema,
  })
  .merge(offsetFieldsSchema);

const ContractCreateSchema = baseContractEventSchema.extend({
  type: z.literal("contract.create"),
});
const ContractStartSchema = baseContractEventSchema.extend({
  type: z.literal("contract.start"),
});
const ContractEditSchema = baseContractEventSchema.extend({
  type: z.literal("contract.edit"),
});
const ContractEndSchema = baseContractEventSchema.extend({
  type: z.literal("contract.end"),
});
const ContractArchiveSchema = baseContractEventSchema.extend({
  type: z.literal("contract.archive"),
});

const baseCommitEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  environment_type: z.string().optional(),
  commit_id: z.string(),
  commit_custom_fields: customFieldsSchema,
  // Absent on customer-level commits not tied to a contract.
  contract_id: z.string().nullish(),
  contract_custom_fields: customFieldsSchema,
  parent_recurring_commit_id: z.string().nullish(),
  customer_id: z.string(),
  customer_custom_fields: customFieldsSchema,
});

const CommitCreateSchema = baseCommitEventSchema.extend({
  type: z.literal("commit.create"),
});
const CommitEditSchema = baseCommitEventSchema.extend({
  type: z.literal("commit.edit"),
});
const CommitArchiveSchema = baseCommitEventSchema.extend({
  type: z.literal("commit.archive"),
});

const segmentFieldsSchema = z.object({
  segment_index: z.number(),
  segment_count: z.number(),
  segment_id: z.string(),
});

const CommitSegmentStartSchema = baseCommitEventSchema
  .merge(segmentFieldsSchema)
  .extend({
    type: z.literal("commit.segment.start"),
  });
const CommitSegmentEndSchema = baseCommitEventSchema
  .merge(segmentFieldsSchema)
  .extend({
    type: z.literal("commit.segment.end"),
  });

const baseCreditEventSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  environment_type: z.string().optional(),
  credit_id: z.string(),
  credit_custom_fields: customFieldsSchema,
  // Absent on customer-level credits not tied to a contract.
  contract_id: z.string().nullish(),
  contract_custom_fields: customFieldsSchema,
  parent_recurring_credit_id: z.string().nullish(),
  customer_id: z.string(),
  customer_custom_fields: customFieldsSchema,
});

const CreditCreateSchema = baseCreditEventSchema.extend({
  type: z.literal("credit.create"),
});
const CreditEditSchema = baseCreditEventSchema.extend({
  type: z.literal("credit.edit"),
});
const CreditArchiveSchema = baseCreditEventSchema.extend({
  type: z.literal("credit.archive"),
});
const CreditSegmentStartSchema = baseCreditEventSchema
  .merge(segmentFieldsSchema)
  .extend({
    type: z.literal("credit.segment.start"),
  });
const CreditSegmentEndSchema = baseCreditEventSchema
  .merge(segmentFieldsSchema)
  .extend({
    type: z.literal("credit.segment.end"),
  });

// ============================================================================
// Invoice notifications — `properties` wrapper.
// ============================================================================

const InvoiceFinalizedSchema = z.object({
  id: z.string(),
  type: z.literal("invoice.finalized"),
  properties: z.object({
    invoice_id: z.string(),
    customer_id: z.string(),
    invoice_finalized_date: z.string(),
  }),
});

const InvoiceBillingProviderErrorSchema = z.object({
  id: z.string(),
  type: z.literal("invoice.billing_provider_error"),
  properties: z.object({
    invoice_id: z.string(),
    customer_id: z.string(),
    billing_provider: z.string(),
    billing_provider_error: z.string(),
  }),
});

// ============================================================================
// Integration issues
// ============================================================================

const IntegrationIssueSchema = z.object({
  id: z.string(),
  type: z.literal("integration.issue"),
  properties: z.object({
    integration: z.string(),
    error: z.string(),
    error_code: z.string(),
    timestamp: z.string(),
  }),
});

// ============================================================================
// Marketplace notifications
// ============================================================================

const MarketplacesAwsMeteringDisabledSchema = z.object({
  id: z.string(),
  type: z.literal("marketplaces.aws_metering_disabled"),
  properties: z.object({
    customer_id: z.string(),
    aws_customer_id: z.string(),
    aws_product_code: z.string(),
  }),
});

const MarketplacesAzureMeteringDisabledSchema = z.object({
  id: z.string(),
  type: z.literal("marketplaces.azure_metering_disabled"),
  properties: z.object({
    customer_id: z.string(),
    subscription_id: z.string(),
  }),
});

const MarketplacesGcpMeteringDisabledSchema = z.object({
  id: z.string(),
  type: z.literal("marketplaces.gcp_metering_disabled"),
  properties: z.object({
    customer_id: z.string(),
    gcp_usage_reporting_id: z.string(),
    gcp_entitlement_id: z.string(),
    gcp_service_name: z.string(),
  }),
});

// ============================================================================
// Payment gating notifications
// ============================================================================

const stripeBillingProviderSchema = z.object({
  type: z.literal("stripe"),
  stripe: z.object({
    payment_intent_id: z.string(),
    error: z
      .object({
        type: z.string(),
        code: z.string(),
        decline_code: z.string().optional(),
        message: z.string(),
      })
      .optional(),
  }),
});

const PaymentGatePaymentStatusSchema = z.object({
  id: z.string(),
  type: z.literal("payment_gate.payment_status"),
  properties: z.object({
    workflow_type: z.string(),
    customer_id: z.string(),
    contract_id: z.string(),
    invoice_id: z.string(),
    payment_status: z.string(),
    timestamp: z.string(),
    error_message: z.string().optional(),
    billing_provider: stripeBillingProviderSchema.optional(),
  }),
});

const PaymentGatePaymentPendingActionRequiredSchema = z.object({
  id: z.string(),
  type: z.literal("payment_gate.payment_pending_action_required"),
  properties: z.object({
    workflow_type: z.string(),
    customer_id: z.string(),
    contract_id: z.string(),
    invoice_id: z.string(),
    error_message: z.string().optional(),
    billing_provider: stripeBillingProviderSchema.optional(),
  }),
});

const PaymentGateThresholdReachedSchema = z.object({
  id: z.string(),
  type: z.literal("payment_gate.threshold_reached"),
  properties: z.object({
    workflow_type: z.string(),
    customer_id: z.string(),
    contract_id: z.string(),
    timestamp: z.string(),
  }),
});

const PaymentGateExternalInitiateSchema = z.object({
  id: z.string(),
  type: z.literal("payment_gate.external_initiate"),
  properties: z.object({
    workflow_type: z.string(),
    customer_id: z.string(),
    contract_id: z.string(),
    workflow_id: z.string(),
    invoice_id: z.string(),
    invoice_total: z.number(),
    invoice_currency: z.string(),
  }),
});

// ============================================================================
// Webhook test event — sent by Metronome when c/licking "Test" in the dashboard.
// No customer_id; used purely to verify the endpoint is reachable.
// ============================================================================

const WebhooksTestSchema = z.object({
  id: z.string(),
  type: z.literal("webhooks.test"),
});

// ============================================================================
// Discriminated union of all known event schemas.
// ============================================================================

export const MetronomeWebhookEventSchema = z.discriminatedUnion("type", [
  LowRemainingCreditBalanceReachedSchema,
  LowRemainingCreditBalanceResolvedSchema,
  LowRemainingContractCreditBalanceReachedSchema,
  LowRemainingContractCreditBalanceResolvedSchema,
  LowRemainingContractCreditAndCommitBalanceReachedSchema,
  LowRemainingContractCreditAndCommitBalanceResolvedSchema,
  LowRemainingSeatBalanceReachedSchema,
  LowRemainingSeatBalanceResolvedSchema,
  SpendThresholdReachedSchema,
  SpendThresholdResolvedSchema,
  LowRemainingCommitBalanceReachedSchema,
  LowRemainingCommitBalanceResolvedSchema,
  UsageThresholdReachedSchema,
  UsageThresholdResolvedSchema,
  InvoiceTotalReachedSchema,
  InvoiceTotalResolvedSchema,
  ContractCreateSchema,
  ContractStartSchema,
  ContractEditSchema,
  ContractEndSchema,
  ContractArchiveSchema,
  CommitCreateSchema,
  CommitEditSchema,
  CommitArchiveSchema,
  CommitSegmentStartSchema,
  CommitSegmentEndSchema,
  CreditCreateSchema,
  CreditEditSchema,
  CreditArchiveSchema,
  CreditSegmentStartSchema,
  CreditSegmentEndSchema,
  InvoiceFinalizedSchema,
  InvoiceBillingProviderErrorSchema,
  IntegrationIssueSchema,
  MarketplacesAwsMeteringDisabledSchema,
  MarketplacesAzureMeteringDisabledSchema,
  MarketplacesGcpMeteringDisabledSchema,
  PaymentGatePaymentStatusSchema,
  PaymentGatePaymentPendingActionRequiredSchema,
  PaymentGateThresholdReachedSchema,
  PaymentGateExternalInitiateSchema,
  WebhooksTestSchema,
]);

export type MetronomeWebhookEvent = z.infer<typeof MetronomeWebhookEventSchema>;
export type MetronomeWebhookEventType = MetronomeWebhookEvent["type"];

// Resolves the Metronome `customer_id` for an event, regardless of whether
// the payload is "flat" (contract.*, commit.*, credit.*) or wrapped under
// `properties` (alerts.*, invoice.*, marketplaces.*, payment_gate.*).
// `integration.issue` is the only event that has no associated customer.
export function getCustomerIdFromEvent(
  event: MetronomeWebhookEvent
): string | null {
  if (event.type === "integration.issue" || event.type === "webhooks.test") {
    return null;
  }
  if ("customer_id" in event) {
    return event.customer_id;
  }
  return event.properties.customer_id;
}
