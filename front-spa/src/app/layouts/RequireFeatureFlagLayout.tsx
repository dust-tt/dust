import Custom404 from "@dust-tt/front/components/pages/Custom404";
import { useFeatureFlags } from "@dust-tt/front/lib/auth/AuthContext";
import type { WhitelistableFeature } from "@dust-tt/front/types/shared/feature_flags";
import { Outlet } from "react-router-dom";

interface RequireFeatureFlagProps {
  flag: WhitelistableFeature;
}

export function RequireFeatureFlagLayout({ flag }: RequireFeatureFlagProps) {
  const { hasFeature } = useFeatureFlags();

  if (!hasFeature(flag)) {
    return <Custom404 />;
  }

  return <Outlet />;
}
