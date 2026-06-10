import type {
  ProfileFormData,
  ProfileFormErrors,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import {
  getInitialSelectedPlatforms,
  validateProfileForm,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useCompleteUserOnboarding, usePatchUser } from "@app/lib/swr/user";
import { useWelcomeData } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import { useEffect, useMemo, useState } from "react";

interface UseProfileOnboardingFormProps {
  // Called once the profile has been successfully submitted.
  onCompleted: () => Promise<void> | void;
}

/**
 * Form state shared by the two profile onboarding surfaces: the full-page
 * /welcome page (legacy flow) and the in-app onboarding dialog shown after
 * checkout in the credit-priced flow.
 */
export function useProfileOnboardingForm({
  onCompleted,
}: UseProfileOnboardingFormProps) {
  const { workspace, user } = useAuth();
  const { patchUser } = usePatchUser();
  const { completeUserOnboarding } = useCompleteUserOnboarding();

  const { welcomeData, isFirstAdmin, emailProvider, isWelcomeDataLoading } =
    useWelcomeData({ workspaceId: workspace.sId });

  const showFavoritePlatformsStep = isFirstAdmin;

  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: user.firstName,
    lastName: user.lastName ?? "",
    jobType: null,
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<FavoritePlatform>
  >(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [platformsInitialized, setPlatformsInitialized] = useState(false);

  // Initialize selectedPlatforms once emailProvider is loaded.
  useEffect(() => {
    if (welcomeData && !platformsInitialized) {
      setSelectedPlatforms(getInitialSelectedPlatforms(emailProvider));
      setPlatformsInitialized(true);
    }
  }, [welcomeData, platformsInitialized, emailProvider]);

  const formErrors = useMemo((): ProfileFormErrors => {
    if (!showErrors) {
      return {};
    }
    return validateProfileForm(formData);
  }, [formData, showErrors]);

  const { submit, isSubmitting } = useSubmitFunction(async () => {
    await patchUser(
      formData.firstName.trim(),
      formData.lastName.trim(),
      false,
      formData.jobType ?? undefined,
      undefined,
      showFavoritePlatformsStep ? Array.from(selectedPlatforms) : undefined,
      emailProvider,
      workspace.sId
    );

    // Clear the pending profile onboarding marker from the user metadata
    // (set at the user's first login).
    await completeUserOnboarding();

    if (typeof window !== "undefined") {
      window.dataLayer = window.dataLayer ?? [];
      const utmParams = getStoredUTMParams();
      window.dataLayer.push({
        event: "signup_completed",
        user_email: user.email,
        company_name: workspace.name,
        gclid: utmParams.gclid ?? null,
        fbclid: utmParams.fbclid ?? null,
        msclkid: utmParams.msclkid ?? null,
        li_fat_id: utmParams.li_fat_id ?? null,
      });
    }

    await onCompleted();
  });

  const handleProfileNext = () => {
    setShowErrors(true);
    const errors = validateProfileForm(formData);
    if (Object.keys(errors).length > 0) {
      return;
    }
    if (showFavoritePlatformsStep) {
      setStep(2);
    } else {
      void submit();
    }
  };

  const togglePlatform = (platform: FavoritePlatform) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const handlePlatformsSubmit = withTracking(
    TRACKING_AREAS.AUTH,
    "onboarding_complete",
    () => {
      void submit();
    }
  );

  return {
    step,
    isFirstAdmin,
    formData,
    setFormData,
    formErrors,
    showErrors,
    selectedPlatforms,
    togglePlatform,
    handleProfileNext,
    handlePlatformsSubmit,
    isSubmitting,
    isWelcomeDataLoading,
  };
}
