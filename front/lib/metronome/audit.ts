import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import type { Authenticator } from "@app/lib/auth";

export function emitSubscriptionChangedAuditEvent({
  auth,
  planCode,
  previousPlanCode,
  metronomeContractId,
}: {
  auth: Authenticator;
  planCode: string;
  previousPlanCode: string;
  metronomeContractId: string;
}): void {
  const workspace = auth.getNonNullableWorkspace();
  void emitAuditLogEventDirect({
    workspace,
    action: "subscription.changed",
    actor: { type: "system", id: "metronome-webhook", name: "Metronome" },
    targets: [buildAuditLogTarget("workspace", workspace)],
    context: { location: "internal" },
    metadata: {
      plan_code: planCode,
      previous_plan_code: previousPlanCode,
      metronome_contract_id: metronomeContractId,
    },
  });
}
