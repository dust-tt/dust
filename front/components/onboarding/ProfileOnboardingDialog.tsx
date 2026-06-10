import {
  FavoritePlatformsStep,
  UserProfileStep,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import { useProfileOnboardingForm } from "@app/components/onboarding/useProfileOnboardingForm";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useIsMetronomeCheckout } from "@app/lib/client/subscription";
import { useAppRouter } from "@app/lib/platform";
import { useUserMetadata } from "@app/lib/swr/user";
import { getConversationRoute } from "@app/lib/utils/router";
import { ONBOARDING_PROFILE_PENDING_METADATA_KEY } from "@app/types/onboarding";
import { Dialog, DialogContent, DialogTitle, Spinner } from "@dust-tt/sparkle";

/**
 * Unskippable dialog shown on top of the application until the user has
 * submitted the profile onboarding form (name and job type, then favorite
 * platforms for the first admin).
 *
 * Only used with the credit-priced checkout flow, where the profile form is
 * collected in-app instead of on the /welcome page: after checkout or phone
 * verification for the first admin, on the first visit for other members.
 * The pending state is stored in the user metadata, set at the user's first
 * login and cleared when the profile form is submitted.
 */
export function ProfileOnboardingDialog() {
  const isMetronomeCheckout = useIsMetronomeCheckout();

  const { metadata, mutateMetadata } = useUserMetadata(
    ONBOARDING_PROFILE_PENDING_METADATA_KEY,
    { disabled: !isMetronomeCheckout }
  );

  const isProfilePending = isMetronomeCheckout && metadata?.value === "true";

  if (!isProfilePending) {
    return null;
  }

  return (
    <ProfileOnboardingDialogContent
      onProfileCompleted={async () => {
        await mutateMetadata();
      }}
    />
  );
}

interface ProfileOnboardingDialogContentProps {
  onProfileCompleted: () => Promise<void>;
}

function ProfileOnboardingDialogContent({
  onProfileCompleted,
}: ProfileOnboardingDialogContentProps) {
  const { workspace, isAdmin } = useAuth();
  const router = useAppRouter();

  const form = useProfileOnboardingForm({
    onCompleted: async ({ isFirstAdmin }) => {
      // The first admin is sent to their personalized welcome conversation;
      // other members stay where they are.
      if (isFirstAdmin) {
        await router.push(
          getConversationRoute(workspace.sId, "new", "welcome=true")
        );
      }
      await onProfileCompleted();
    },
  });

  return (
    <Dialog open>
      <DialogContent
        size="2xl"
        height="2xl"
        isAlertDialog
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to Dust</DialogTitle>
        <div className="flex-1 overflow-y-auto px-12 py-8">
          {form.isWelcomeDataLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : form.step === 1 ? (
            <UserProfileStep
              owner={workspace}
              isAdmin={isAdmin}
              formData={form.formData}
              setFormData={form.setFormData}
              formErrors={form.formErrors}
              showErrors={form.showErrors}
              onNext={form.handleProfileNext}
            />
          ) : (
            <FavoritePlatformsStep
              selectedPlatforms={form.selectedPlatforms}
              onTogglePlatform={form.togglePlatform}
              onSubmit={form.handlePlatformsSubmit}
              isSubmitting={form.isSubmitting}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
