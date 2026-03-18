import { Novu } from "@novu/api";

export const getNovuClient = async (): Promise<Novu> => {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new Error("NOVU_SECRET_KEY is not set");
  }

  if (!process.env.NEXT_PUBLIC_NOVU_API_URL) {
    throw new Error("NEXT_PUBLIC_NOVU_API_URL is not set");
  }

  return new Novu({
    secretKey: process.env.NOVU_SECRET_KEY,
    serverURL: process.env.NEXT_PUBLIC_NOVU_API_URL,
  });
};
