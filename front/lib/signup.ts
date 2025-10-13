export function getSignInUrl({
  signupCallbackUrl,
  invitationEmail,
  userExists,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
  userExists: boolean;
}) {
  let signUpUrl = `/api/workos/login?returnTo=${signupCallbackUrl}`;
  if (!userExists) {
    signUpUrl += "&screenHint=sign-up";
  }
  if (invitationEmail) {
    signUpUrl += `&loginHint=${encodeURIComponent(invitationEmail)}`;
  }
  return signUpUrl;
}
