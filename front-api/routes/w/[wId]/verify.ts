import { resolveCountryCode } from "@app/lib/geo/country-detection";
import type { GetVerifyResponseBody } from "@app/lib/plans/trial/index";
import { isWorkspaceEligibleForTrial } from "@app/lib/plans/trial/index";
import { getClientIp } from "@app/lib/utils/request";
import logger from "@app/logger/logger";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import type { Context } from "hono";
import type { Country } from "react-phone-number-input";
import { isSupportedCountry } from "react-phone-number-input";

const DEFAULT_COUNTRY: Country = "US";

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
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetVerifyResponseBody> => {
    const auth = ctx.get("auth");

    const isEligibleForTrial = await isWorkspaceEligibleForTrial(auth);
    const initialCountryCode = await detectCountryFromIP(ctx);

    return ctx.json({
      isEligibleForTrial,
      initialCountryCode,
    });
  }
);

export default app;
