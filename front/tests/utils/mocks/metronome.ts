import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

export function mockCustomerAlert({
  id,
  threshold,
  customer_status,
  uniqueness_key,
}: {
  id: string;
  threshold: number;
  customer_status: CustomerAlert["customer_status"];
  uniqueness_key?: string;
}): CustomerAlert {
  return {
    alert: {
      id,
      name: id,
      status: "enabled",
      threshold,
      type: "spend_threshold_reached",
      updated_at: "2024-01-01T00:00:00Z",
      ...(uniqueness_key !== undefined ? { uniqueness_key } : {}),
    },
    customer_status,
  };
}
