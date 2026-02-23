import config from "@app/lib/api/config";

export function getSignInUrl({
  signupCallbackUrl,
  invitationEmail,
  userExists,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
  userExists: boolean;
}) {
  let signUpUrl = `${config.getClientFacingUrl()}/api/workos/login?returnTo=${encodeURIComponent(signupCallbackUrl)}`;
  if (!userExists) {
    signUpUrl += "&screenHint=sign-up";
  }
  if (invitationEmail) {
    signUpUrl += `&loginHint=${encodeURIComponent(invitationEmail)}`;
  }
  return signUpUrl;
}
