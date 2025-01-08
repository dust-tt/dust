export function getSignUpUrl({
  signupCallbackUrl,
  invitationEmail,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
}) {
  let signUpUrl = `/api/auth/login?returnTo=${signupCallbackUrl}&screen_hint=signup`;

  if (invitationEmail) {
    signUpUrl += `&login_hint=${encodeURIComponent(invitationEmail)}`;
  }

  return signUpUrl;
}
