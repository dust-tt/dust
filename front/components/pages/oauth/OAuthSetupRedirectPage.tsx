import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

import {
  useAppRouter,
  useRequiredPathParam,
  useSearchParam,
} from "@app/lib/platform";
import { useOAuthSetup } from "@app/lib/swr/oauth";
import type { OAuthCredentials, OAuthProvider, OAuthUseCase } from "@app/types";
import { isOAuthProvider, isOAuthUseCase } from "@app/types";

export function OAuthSetupRedirectPage() {
  const wId = useRequiredPathParam("wId");
  const provider = useRequiredPathParam("provider");
  const useCaseParam = useSearchParam("useCase");
  const extraConfigParam = useSearchParam("extraConfig");

  const router = useAppRouter();

  // Validate provider
  const validProvider: OAuthProvider | null = isOAuthProvider(provider)
    ? provider
    : null;

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

  // When disabled, placeholder values are not used but required for types
  const { redirectUrl, isOAuthSetupLoading, isOAuthSetupError } = useOAuthSetup(
    {
      workspaceId: wId,
      provider: validProvider ?? "github",
      useCase: useCase ?? "connection",
      extraConfig,
      disabled: !validProvider || !useCase,
    }
  );

  useEffect(() => {
    if (redirectUrl) {
      void router.replace(redirectUrl);
    }
  }, [redirectUrl, router]);

  if (isOAuthSetupError || !validProvider || !useCase) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-element-700">
          {!validProvider
            ? "Invalid OAuth provider."
            : !useCase
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
