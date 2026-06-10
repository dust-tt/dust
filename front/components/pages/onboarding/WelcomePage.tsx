import {
  FavoritePlatformsStep,
  UserProfileStep,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import { useProfileOnboardingForm } from "@app/components/onboarding/useProfileOnboardingForm";
import OnboardingLayout from "@app/components/sparkle/OnboardingLayout";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { getConversationRoute } from "@app/lib/utils/router";
import { Spinner } from "@dust-tt/sparkle";

export function WelcomePage() {
  const { workspace, isAdmin } = useAuth();
  const router = useAppRouter();
  const conversationId = useSearchParam("cId");

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
