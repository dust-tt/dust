import type { User } from "@workos-inc/node";

export type SessionWithUser = {
  sessionId: string;
  user: User;
};
