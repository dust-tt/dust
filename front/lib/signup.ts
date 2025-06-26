export function getSignUpUrl({
  signupCallbackUrl,
  invitationEmail,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
}) {
  let signUpUrl = `/api/workos/login?returnTo=${signupCallbackUrl}&screenHint=sign-up`;
  if (invitationEmail) {
    signUpUrl += `&loginHint=${encodeURIComponent(invitationEmail)}`;
  }
  return signUpUrl;
}
