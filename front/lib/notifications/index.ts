import { Novu } from "@novu/js";

import type { UserType } from "@app/types";

export const getNovuClient = (user: UserType) => {
  if (!process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER) {
    throw new Error("NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER is not set");
  }
  if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
  }
  if (!process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL is not set");
  }

  const config = {
    applicationIdentifier: process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER,
    apiUrl: process.env.NEXT_PUBLIC_NOVU_API_URL,
    socketUrl: process.env.NEXT_PUBLIC_NOVU_WEBSOCKET_API_URL,
    subscriber: user.sId,
  };

  return new Novu(config);
};
