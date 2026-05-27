import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

/**
 * Build a minimal `CustomerAlert` for tests. Only the fields the production
 * code reads (`alert.id`, `alert.threshold`, `alert.uniqueness_key`,
 * `customer_status`) are configurable; the rest get inert defaults so
 * mocks satisfy the SDK shape without leaking unrelated noise into
 * assertions.
 */
export function buildCustomerAlertMock({
  id = "alert_test_xxx",
  threshold = 1000,
  uniquenessKey,
  customerStatus = "ok",
}: {
  id?: string;
  threshold?: number;
  uniquenessKey?: string;
  customerStatus?: CustomerAlert["customer_status"];
} = {}): CustomerAlert {
  return {
    alert: {
      id,
      name: `Test alert ${id}`,
      status: "enabled",
      threshold,
      type: "spend_threshold_reached",
      updated_at: "2026-01-01T00:00:00.000Z",
      uniqueness_key: uniquenessKey,
    },
    customer_status: customerStatus,
    triggered_by: null,
  };
}
