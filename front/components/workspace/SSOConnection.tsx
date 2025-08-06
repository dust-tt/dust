import type { Organization } from "@workos-inc/node";

import WorkOSSSOConnection from "@app/components/workspace/sso/WorkOSSSOConnection";
import type { PlanType, WorkspaceType } from "@app/types";

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
  if (!plan.limits.users.isSSOAllowed) {
    return null;
  }

  return <WorkOSSSOConnection domains={domains} owner={owner} plan={plan} />;
}
