import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { FREE_NO_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import type { SubscriptionType } from "@app/types/plan";
import type { ProgrammaticUsageConfigurationType } from "@app/types/programmatic_usage";
import type { WorkspaceType } from "@app/types/user";
import { Button } from "@dust-tt/sparkle";

interface DowngradeToNoPlanButtonProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  programmaticUsageConfig: ProgrammaticUsageConfigurationType | null;
}

export default function DowngradeToNoPlanButton({
  owner,
  subscription,
  programmaticUsageConfig,
}: DowngradeToNoPlanButtonProps) {
  const router = useAppRouter();

  const { submit: onDowngrade } = useSubmitFunction(async () => {
    if (
      !window.confirm(
        "Confirm workspace downgrade to no plan? This action will pause all connectors and delete data after the retention period expires."
      )
    ) {
      return;
    }
    try {
      const r = await clientFetch(
        `/api/poke/workspaces/${owner.sId}/downgrade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      if (!r.ok) {
        throw new Error("Failed to downgrade workspace.");
      }
      router.reload();
    } catch {
      window.alert("An error occurred while downgrading the workspace.");
    }
  });

  return (
    <Button
      variant="warning"
      onClick={onDowngrade}
      disabled={
        subscription.plan.code === FREE_NO_PLAN_CODE ||
        !!programmaticUsageConfig?.paygCapMicroUsd
      }
      label="⛔️ Downgrade to NO PLAN"
    />
  );
}
