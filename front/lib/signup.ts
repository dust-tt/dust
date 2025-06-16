export function getSignUpUrl({
  signupCallbackUrl,
  invitationEmail,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
}) {
  // if (featureFlags.includes("workos") && workspace.workOSOrganizationId) {
  //   return `api/workos/login?organizationId=${workspace.workOSOrganizationId}`;
  // }

  let signUpUrl = `/api/workos/login?returnTo=${signupCallbackUrl}&screen_hint=sign-up`;

  if (invitationEmail) {
    signUpUrl += `&login_hint=${encodeURIComponent(invitationEmail)}`;
  }

  return signUpUrl;
}
