import { DUST_US_URL } from "@extension/shared/lib/config";

// The only page of the auth dialog (`auth.ts`). It is on the add-in domain, as Office requires
// for the first page of a dialog and for `messageParent`.
export const AUTH_DIALOG_PATH = "/auth.html";

// The Dust login. WorkOS redirects to `AUTH_DIALOG_PATH` with `code` or `error` after sign-in.
export function getLoginUrl({
  codeChallenge,
  organizationId,
}: {
  codeChallenge: string;
  organizationId: string | null;
}): string {
  const loginParams = new URLSearchParams({
    redirect_uri: `${window.location.origin}${AUTH_DIALOG_PATH}`,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    ...(organizationId ? { organizationId } : {}),
  });
  return `${DUST_US_URL}/api/workos/login?${loginParams}`;
}
