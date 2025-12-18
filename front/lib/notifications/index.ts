import { Novu } from "@novu/node";
import { createHmac } from "crypto";

import type { UserTypeWithWorkspaces } from "@app/types";

export type NotificationAllowedTags = Array<"conversations" | "admin">;

export const getNovuClient = async (): Promise<Novu> => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
  }

  const config = {
    apiKey: process.env.NOVU_SECRET_KEY,
    backendUrl: process.env.NEXT_PUBLIC_NOVU_API_URL,
  };

  return new Novu(process.env.NOVU_SECRET_KEY, config);
};

export const getSubscriberHash = async (
  user: UserTypeWithWorkspaces
): Promise<string | null> => {
  return computeSubscriberHash(user.sId);
};

export const computeSubscriberHash = (subscriberId: string): string => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  const novuSecretKey = process.env.NOVU_SECRET_KEY;

  const hmacHash = createHmac("sha256", novuSecretKey)
    .update(subscriberId)
    .digest("hex");

  return hmacHash;
};
