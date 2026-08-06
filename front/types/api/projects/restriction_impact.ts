// How far back an invocation still counts as evidence of ongoing use. Long enough to catch
// monthly-cadence callers, short enough that departed members do not inflate the estimate. Shared
// so the warning text cannot drift from the window the counts were measured over.
export const POD_RESTRICTION_IMPACT_WINDOW_DAYS = 30;

// How much Pod function usage a restriction would break, measured over a recent window of
// invocations. Counts only: the surface is a pre-flight warning on the visibility toggle, not a
// usage report.
export type PodRestrictionImpactType = {
  // Invocations by users who would lose access to the Pod once it is restricted.
  brokenInvocationCount: number;
  // How many distinct such users. Never includes Pod members or workspace admins, who keep
  // access.
  brokenUserCount: number;
  // Every invocation counted in the window, so the broken count reads against a baseline.
  totalInvocationCount: number;
  // Invocations with no human actor (API keys, Slack/email bots). These break on their key's
  // access rather than a user's, so they are reported apart instead of folded into the above.
  nonHumanInvocationCount: number;
};

export type GetPodRestrictionImpactResponseBody = {
  restrictionImpact: PodRestrictionImpactType;
};
