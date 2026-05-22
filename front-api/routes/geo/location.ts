import { resolveCountryCode } from "@app/lib/geo/country-detection";
import { isGDPRCountry } from "@app/lib/geo/eu-detection";
import { getClientIp } from "@app/lib/utils/request";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { getConnInfo } from "@hono/node-server/conninfo";

export type GeoLocationResponse = {
  isGDPR: boolean;
  countryCode?: string;
  dev?: boolean;
};

// Mounted at /api/geo/location. No workspace auth — top-level route.
const app = unauthedApp();

app.get("/", async (ctx) => {
  const connInfo = getConnInfo(ctx);
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ip = getClientIp({
    headers,
    socket: { remoteAddress: connInfo.remote.address },
  });

  if (ip === "internal") {
    logger.error("No IP address found in request");
    return ctx.json({ error: "No IP address found" }, 400);
  }

  try {
    const countryCode = await resolveCountryCode(ip);
    const body: GeoLocationResponse = {
      isGDPR: isGDPRCountry(countryCode),
      countryCode,
    };
    return ctx.json(body);
  } catch (err) {
    logger.error({ error: normalizeError(err) }, "Error in geolocation API");
    return ctx.json(
      { error: "Internal server error while fetching geolocation" },
      500
    );
  }
});

export default app;
