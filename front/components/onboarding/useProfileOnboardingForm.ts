import type {
  ProfileFormData,
  ProfileFormErrors,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import {
  getInitialSelectedPlatforms,
  validateProfileForm,
} from "@app/components/onboarding/ProfileOnboardingSteps";
import { useUserLocale } from "@app/hooks/useUserLocale";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useCompleteUserOnboarding, usePatchUser } from "@app/lib/swr/user";
import { useAuthContext, useWelcomeData } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { getStoredUTMParams } from "@app/lib/utils/utm";
import type { FavoritePlatform } from "@app/types/favorite_platforms";
import type { SupportedLocale } from "@app/types/locale";
import { useEffect, useMemo, useState } from "react";

interface UseProfileOnboardingFormProps {
  // Called once the profile has been successfully submitted.
  onCompleted: (result: { isFirstAdmin: boolean }) => Promise<void> | void;
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
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  // The language the UI is currently in. By default it's their workspace locale
  const { userLocale: defaultLocale } = useUserLocale({ owner: workspace });
  const { mutateAuthContext } = useAuthContext({
    workspaceId: workspace.sId,
    disabled: true,
  });

  const { welcomeData, isFirstAdmin, emailProvider, isWelcomeDataLoading } =
    useWelcomeData({ workspaceId: workspace.sId });

  const showFavoritePlatformsStep = isFirstAdmin;

  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<ProfileFormData>({
    firstName: user.firstName,
    lastName: user.lastName ?? "",
    pronouns: "",
    jobType: null,
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    Set<FavoritePlatform>
  >(new Set());
  const [locale, setLocale] = useState<SupportedLocale>(defaultLocale);
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
    await patchUser({
      firstName: formData.firstName.trim(),
      lastName: formData.lastName.trim(),
      notifySuccess: false,
      jobType: formData.jobType ?? undefined,
      // Left unset when blank so onboarding never clears pronouns set elsewhere.
      pronouns: formData.pronouns.trim() || undefined,
      favoritePlatforms: showFavoritePlatformsStep
        ? Array.from(selectedPlatforms)
        : undefined,
      emailProvider,
      workspaceId: workspace.sId,
    });

    // Clear the pending profile onboarding marker from the user metadata
    // (set at the user's first login). With the `localisation` flag, the locale is saved even when
    // left to the default.
    const completed = await completeUserOnboarding({
      locale: hasLocalisation ? locale : undefined,
    });
    
    if (completed && hasLocalisation && locale !== defaultLocale) {
      // Switches the UI to the saved locale.
      await mutateAuthContext();
    }

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

    await onCompleted({ isFirstAdmin });
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
    // Null when the language cannot be picked (`localisation` flag disabled).
    locale: hasLocalisation ? locale : null,
    setLocale,
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
