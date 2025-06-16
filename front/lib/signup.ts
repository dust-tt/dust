export function getSignUpUrl({
  signupCallbackUrl,
  invitationEmail,
  workOSEnabled,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
  workOSEnabled?: boolean;
}) {
  if (workOSEnabled) {
    let signUpUrl = `/api/workos/login?returnTo=${signupCallbackUrl}&screenHint=sign-up`;
    if (invitationEmail) {
      signUpUrl += `&loginHint=${encodeURIComponent(invitationEmail)}`;
    }
    return signUpUrl;
  }

  let signUpUrl = `/api/auth/login?returnTo=${signupCallbackUrl}&prompt=login&screen_hint=signup`;
  if (invitationEmail) {
    signUpUrl += `&login_hint=${encodeURIComponent(invitationEmail)}`;
  }

  return signUpUrl;
}
