import config from "@app/lib/api/config";
import type { LightWorkspaceType } from "@app/types/user";

export type OnboardingType =
  | "email_invite"
  | "domain_conversation_link"
  | "domain_invite_link";

export type GetJoinResponseBody = {
  onboardingType: OnboardingType;
  workspace: LightWorkspaceType;
  signInUrl: string;
  userExists: boolean;
};

export function getSignInUrl({
  signupCallbackUrl,
  invitationEmail,
  userExists,
}: {
  signupCallbackUrl: string;
  invitationEmail?: string;
  userExists: boolean;
}) {
  let signUpUrl = `${config.getApiBaseUrl()}/api/workos/login?returnTo=${encodeURIComponent(signupCallbackUrl)}`;
  if (!userExists) {
    signUpUrl += "&screenHint=sign-up";
  }
  if (invitationEmail) {
    signUpUrl += `&loginHint=${encodeURIComponent(invitationEmail)}`;
  }
  return signUpUrl;
}
