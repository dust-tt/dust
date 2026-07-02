import WorkOSSSOConnection from "@app/components/workspace/sso/WorkOSSSOConnection";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { PlanType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import type { Organization } from "@workos-inc/node";

interface SSOConnectionProps {
  domains: Organization["domains"];
  owner: WorkspaceType;
  plan: PlanType;
}

export default function SSOConnection({
  domains,
  owner,
  plan,
}: SSOConnectionProps) {
  const { hasFeature } = useFeatureFlags();

  if (!plan.limits.users.isSSOAllowed && !hasFeature("allow_sso")) {
    return null;
  }

  return <WorkOSSSOConnection domains={domains} owner={owner} plan={plan} />;
}
