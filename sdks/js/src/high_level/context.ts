import type { UserMessageOrigin } from "../types";

export type { UserMessageOrigin };

export interface MessageContext {
  username: string;
  email?: string;
  fullName?: string;
  timezone: string;
  profilePictureUrl?: string;
  origin: UserMessageOrigin;
}

export type PartialMessageContext = Partial<MessageContext>;

const DEFAULT_CONTEXT: MessageContext = {
  username: "API User",
  timezone: "UTC",
  origin: "api",
};

function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function buildContext(partial?: PartialMessageContext): MessageContext {
  return {
    username: partial?.username ?? DEFAULT_CONTEXT.username,
    timezone: partial?.timezone ?? getSystemTimezone(),
    origin: partial?.origin ?? DEFAULT_CONTEXT.origin,
    email: partial?.email,
    fullName: partial?.fullName ?? partial?.username,
    profilePictureUrl: partial?.profilePictureUrl,
  };
}
