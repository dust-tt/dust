const DUST_DOMAIN = "dust.tt";

export function isDustEmail(email?: string): boolean {
  const domain = String(email || "")
    .toLowerCase()
    .trim()
    .split("@")[1];
  return domain === DUST_DOMAIN || Boolean(domain?.endsWith(`.${DUST_DOMAIN}`));
}

export type ExternalClassification = {
  external: boolean;
  reason: string;
  meetingType: string | null;
};

/**
 * Claap sets `meeting.type` to "external" when at least one participant is
 * outside the organization, "internal" otherwise.
 * https://docs.claap.io/api-reference/endpoint/get_recording
 */
export function classifyExternal(recording: {
  meeting?: { type?: string; participants?: Array<{ email?: string }> };
  recorder?: { email?: string };
  channel?: { name?: string };
}): ExternalClassification {
  const meetingType = recording.meeting?.type ?? null;
  if (meetingType === "external") {
    return { external: true, reason: "meeting.type=external", meetingType };
  }
  if (meetingType === "internal") {
    return { external: false, reason: "meeting.type=internal", meetingType };
  }

  const emails = [
    ...(recording.meeting?.participants ?? []).map((person) => person.email),
    recording.recorder?.email,
  ].filter((email): email is string => Boolean(email));
  const outside = emails.filter((email) => !isDustEmail(email));
  if (outside.length > 0) {
    return {
      external: true,
      reason: `meeting.type missing; non-dust.tt emails ${outside.join(",")}`,
      meetingType,
    };
  }
  if (emails.length > 0) {
    return {
      external: false,
      reason: "meeting.type missing; all participant emails are @dust.tt",
      meetingType,
    };
  }

  const channel = String(recording.channel?.name || "")
    .trim()
    .toLowerCase();
  if (channel === "external") {
    return {
      external: true,
      reason: "meeting.type missing; channel=External",
      meetingType,
    };
  }
  if (channel === "internal") {
    return {
      external: false,
      reason: "meeting.type missing; channel=Internal",
      meetingType,
    };
  }

  return {
    external: false,
    reason: "meeting.type missing; no participant emails or channel signal",
    meetingType,
  };
}
