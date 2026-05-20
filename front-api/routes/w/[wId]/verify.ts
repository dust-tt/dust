import { resolveCountryCode } from "@app/lib/geo/country-detection";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial/index";
import { getClientIp } from "@app/lib/utils/request";
import logger from "@app/logger/logger";
import { apiError } from "@front-api/middleware/utils";
import type { Context } from "hono";
import { Hono } from "hono";
import type { Country } from "react-phone-number-input";
import { isSupportedCountry } from "react-phone-number-input";

const DEFAULT_COUNTRY: Country = "US";

export type GetVerifyResponseBody = {
  isEligibleForTrial: boolean;
  initialCountryCode: Country;
};

async function detectCountryFromIP(ctx: Context): Promise<Country> {
  try {
    const headers: Record<string, string> = {};
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });
    const ip = getClientIp({ headers });
    if (ip === "internal") {
      return DEFAULT_COUNTRY;
    }
    const countryCode = await resolveCountryCode(ip);
    if (isSupportedCountry(countryCode)) {
      return countryCode;
    }
    return DEFAULT_COUNTRY;
  } catch (error) {
    logger.error({ error }, "Error detecting country from IP");
    return DEFAULT_COUNTRY;
  }
}

// Mounted at /api/w/:wId/verify.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can access this endpoint.",
      },
    });
  }

  const isEligibleForTrial = await isWorkspaceEligibleForTrial(auth);
  const initialCountryCode = await detectCountryFromIP(ctx);

  const body: GetVerifyResponseBody = {
    isEligibleForTrial,
    initialCountryCode,
  };
  return ctx.json(body);
});

export default app;
