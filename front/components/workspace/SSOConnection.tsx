import WorkOSSSOConnection from "@app/components/workspace/sso/WorkOSSSOConnection";
import { isSSOAllowedForWorkspace } from "@app/lib/plans/sso";
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
  if (!isSSOAllowedForWorkspace(owner, plan)) {
    return null;
  }

  return <WorkOSSSOConnection domains={domains} owner={owner} plan={plan} />;
}
