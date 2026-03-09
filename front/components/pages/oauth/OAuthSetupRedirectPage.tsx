import { useAppRouter, usePathParam, useSearchParam } from "@app/lib/platform";
import { useOAuthSetup } from "@app/lib/swr/oauth";
import type {
  OAuthCredentials,
  OAuthProvider,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isOAuthProvider, isOAuthUseCase } from "@app/types/oauth/lib";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function OAuthSetupRedirectPage() {
  const wId = usePathParam("wId");
  const providerParam = usePathParam("provider");
  const useCaseParam = useSearchParam("useCase");
  const extraConfigParam = useSearchParam("extraConfig");
  const openerOriginParam = useSearchParam("openerOrigin");

  const router = useAppRouter();

  // Validate provider (null if router not ready or invalid)
  const provider: OAuthProvider | null =
    providerParam && isOAuthProvider(providerParam) ? providerParam : null;

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
  const { redirectUrl, isOAuthSetupError } = useOAuthSetup({
    workspaceId: wId ?? "placeholder",
    provider: provider ?? "github",
    useCase: useCase ?? "connection",
    extraConfig,
    openerOrigin: openerOriginParam ?? undefined,
    disabled: !wId || !provider || !useCase,
  });

  useEffect(() => {
    if (redirectUrl) {
      void router.replace(redirectUrl);
    }
  }, [redirectUrl, router]);

  // Show spinner while waiting for router to be ready
  if (!wId || !providerParam) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  // Router is ready, check for validation errors
  if (isOAuthSetupError || !provider || !useCase) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-element-700">
          {!provider
            ? "Invalid OAuth provider."
            : !useCase
              ? "Invalid OAuth use case."
              : "Failed to initialize OAuth connection."}
        </p>
      </div>
    );
  }

  // Loading or redirecting
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner size="xl" />
    </div>
  );
}
