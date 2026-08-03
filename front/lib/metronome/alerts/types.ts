import type { CustomerAlert } from "@metronome/sdk/resources/v1/customers";

// Metronome's current evaluation of an alert: `in_alarm` (breached / firing),
// `ok` (resolved / normal), `evaluating` (pending), or `null` (unknown).
export type MetronomeAlertStatus = CustomerAlert["customer_status"];

// A Metronome alert resolved for a workspace: its id (for deep-linking from
// Poke) plus its current evaluation status (for display).
export type MetronomeAlertRef = {
  id: string;
  status: MetronomeAlertStatus;
};
