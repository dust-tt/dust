import type { Organization } from "@workos-inc/node";

import WorkOSSSOConnection from "@app/components/workspace/sso/WorkOSSSOConnection";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
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
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  // Feature flag `okta_enterprise_connection` is required to use SSO.
  const hasSSOFeatureFlag = featureFlags.includes("okta_enterprise_connection");

  if (!hasSSOFeatureFlag) {
    return null;
  }

  return <WorkOSSSOConnection domains={domains} owner={owner} plan={plan} />;
}
