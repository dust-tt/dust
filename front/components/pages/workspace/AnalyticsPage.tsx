import { LegacyAnalyticsPage } from "@app/components/pages/workspace/LegacyAnalyticsPage";
import { NewAnalyticsPage } from "@app/components/pages/workspace/NewAnalyticsPage";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";

export function AnalyticsPage() {
  const { hasFeature } = useFeatureFlags();

  if (hasFeature("new_analytics_page")) {
    return <NewAnalyticsPage />;
  }

  return <LegacyAnalyticsPage />;
}
