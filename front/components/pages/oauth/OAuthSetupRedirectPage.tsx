import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import { useOAuthSetup } from "@app/lib/swr/oauth";
import type { OAuthCredentials, OAuthUseCase } from "@app/types";
import { isOAuthUseCase } from "@app/types";

export function OAuthSetupRedirectPage() {
  const wId = useRequiredPathParam("wId");
  const provider = useRequiredPathParam("provider");
  const useCaseParam = useSearchParam("useCase");
  const extraConfigParam = useSearchParam("extraConfig");

  const router = useAppRouter();

  // Validate useCase
  const useCase: OAuthUseCase | null = isOAuthUseCase(useCaseParam)
    ? useCaseParam
    : null;

  // Parse extraConfig if present
  let extraConfig: OAuthCredentials | undefined;
  if (extraConfigParam) {
    try {
      extraConfig = JSON.parse(extraConfigParam) as OAuthCredentials;
    } catch {
      // Invalid JSON - extraConfig will be undefined
    }
  }

  const { redirectUrl, isOAuthSetupLoading, isOAuthSetupError } = useOAuthSetup(
    {
      workspaceId: wId,
      provider: provider as any, // Type will be validated on the API side
      useCase: useCase ?? ("connection" as OAuthUseCase), // Fallback, will error if invalid
      extraConfig,
    }
  );

  useEffect(() => {
    if (redirectUrl) {
      void router.replace(redirectUrl);
    }
  }, [redirectUrl, router]);

  if (isOAuthSetupError || !useCase) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-element-700">
          {!useCase
            ? "Invalid OAuth use case."
            : "Failed to initialize OAuth connection."}
        </p>
      </div>
    );
  }

  if (isOAuthSetupLoading || redirectUrl) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
