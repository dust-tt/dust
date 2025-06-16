export function getSignUpUrl({
  signupCallbackUrl,
  invitationEmail,
  workOSEnabled,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
  workOSEnabled?: boolean;
}) {
  let signUpUrl;
  if (workOSEnabled) {
    signUpUrl = `/api/workos/login?returnTo=${signupCallbackUrl}&screen_hint=sign-up`;
  } else {
    signUpUrl = `/api/auth/login?returnTo=${signupCallbackUrl}&prompt=login&screen_hint=signup`;
  }
  if (invitationEmail) {
    signUpUrl += `&login_hint=${encodeURIComponent(invitationEmail)}`;
  }

  return signUpUrl;
}
