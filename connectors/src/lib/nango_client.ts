import { Nango } from "@nangohq/node";

const { NANGO_SECRET_KEY } = process.env;

export function nango_client(): Nango {
  if (!NANGO_SECRET_KEY) {
    throw new Error("Env var NANGO_SECRET_KEY is not defined");
  }
  const nango = new Nango({ secretKey: NANGO_SECRET_KEY });

  return nango;
}
