import { withSuspense } from "@spa/app/routes/withSuspense";
import type { RouteObject } from "react-router-dom";

const WelcomePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/WelcomePage"),
  "WelcomePage"
);
const SubscribePage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/SubscribePage"),
  "SubscribePage"
);
const TrialPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/TrialPage"),
  "TrialPage"
);
const TrialEndedPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/TrialEndedPage"),
  "TrialEndedPage"
);
const VerifyPage = withSuspense(
  () => import("@dust-tt/front/components/pages/onboarding/VerifyPage"),
  "VerifyPage"
);

// Onboarding routes inside workspace (paywall-whitelisted)
export const onboardingRoutes: RouteObject[] = [
  {
    path: "welcome",
    element: <WelcomePage />,
    handle: { requireCanUseProduct: false },
  },
  {
    path: "subscribe",
    element: <SubscribePage />,
    handle: { requireCanUseProduct: false },
  },
  {
    path: "trial",
    element: <TrialPage />,
    handle: { requireCanUseProduct: false },
  },
  {
    path: "trial-ended",
    element: <TrialEndedPage />,
    handle: { requireCanUseProduct: false },
  },
  {
    path: "verify",
    element: <VerifyPage />,
    handle: { requireCanUseProduct: false },
  },
];
