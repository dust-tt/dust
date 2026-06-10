import {
  FavoritePlatformsStep,
  UserProfileStep,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import { useProfileOnboardingForm } from "@app/components/onboarding/useProfileOnboardingForm";
import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useIsMetronomeCheckout } from "@app/lib/client/subscription";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { Spinner } from "@dust-tt/sparkle";

export function WelcomePage() {
  const { workspace, isAdmin } = useAuth();
  const router = useAppRouter();
  const conversationId = useSearchParam("cId");
  const isMetronomeCheckout = useIsMetronomeCheckout();

  const form = useProfileOnboardingForm({
    onCompleted: async () => {
      const queryParams = `welcome=true${
        conversationId ? `&cId=${conversationId}` : ""
      }`;
      await router.push(
        getConversationRoute(workspace.sId, "new", queryParams)
      );
    },
  });

  // With the credit-priced checkout flow, the profile form is collected in-app
  // (onboarding dialog): send the user into the workspace. For the first admin
  // pre-checkout, the paywall redirects them to the plan selection page first.
  if (isMetronomeCheckout) {
    void router.replace(
      `/w/${workspace.sId}${conversationId ? `?cId=${conversationId}` : ""}`
    );
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Show loading while fetching welcome data.
  if (form.isWelcomeDataLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (form.step === 1) {
    return (
      <OnboardingLayout owner={workspace}>
        <UserProfileStep
          owner={workspace}
          isAdmin={isAdmin}
          formData={form.formData}
          setFormData={form.setFormData}
          formErrors={form.formErrors}
          showErrors={form.showErrors}
          onNext={form.handleProfileNext}
        />
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout owner={workspace}>
      <FavoritePlatformsStep
        selectedPlatforms={form.selectedPlatforms}
        onTogglePlatform={form.togglePlatform}
        onSubmit={form.handlePlatformsSubmit}
        isSubmitting={form.isSubmitting}
      />
    </OnboardingLayout>
  );
}
