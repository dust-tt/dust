import type { Organization } from "@workos-inc/node";

import Auth0SSOConnection from "@app/components/workspace/sso/Auth0SSOConnection";
import { AutoJoinToggle } from "@app/components/workspace/sso/AutoJoinToggle";
import WorkOSSSOConnection from "@app/components/workspace/sso/WorkOSSSOConnection";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { PlanType, WorkspaceDomain, WorkspaceType } from "@app/types";

export interface EnterpriseConnectionStrategyDetails {
  callbackUrl: string;
  initiateLoginUrl: string;
  // SAML Specific.
  audienceUri: string;
  samlAcsUrl: string;
}

interface SSOConnectionProps {
  domains: Organization["domains"];
  owner: WorkspaceType;
  plan: PlanType;
  strategyDetails: EnterpriseConnectionStrategyDetails;
}

export default function SSOConnection({
  domains,
  owner,
  plan,
  strategyDetails,
}: SSOConnectionProps) {
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  // Feature flag `okta_enterprise_connection` is required to use SSO.
  const hasSSOFeatureFlag = featureFlags.includes("okta_enterprise_connection");
  // If the `workos` feature flag is also enabled, then we can use the WorkOS SSO connection.
  const hasWorkOSSSOFeatureFlag = featureFlags.includes("workos");

  if (!hasSSOFeatureFlag) {
    return null;
  }

  return !hasWorkOSSSOFeatureFlag ? (
    <Auth0SSOConnection
      domains={domains}
      owner={owner}
      plan={plan}
      strategyDetails={strategyDetails}
    />
  ) : (
    <WorkOSSSOConnection domains={domains} owner={owner} plan={plan} />
  );
}
