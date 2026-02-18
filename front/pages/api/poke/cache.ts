import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { runOnRedis } from "@app/lib/api/redis";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPokeCacheResponseBody = {
  key: string;
  value: unknown | null;
  ttlSeconds: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeCacheResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { rawKey } = req.query;

      if (!isString(rawKey)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The 'rawKey' query parameter must be provided.",
          },
        });
      }

      const { value, ttlSeconds } = await runOnRedis(
        { origin: "poke_cache_lookup" },
        async (client) => {
          const [rawValue, ttl] = await Promise.all([
            client.get(rawKey),
            client.ttl(rawKey),
          ]);

          let parsed: unknown | null = null;
          if (rawValue !== null) {
            try {
              parsed = JSON.parse(rawValue);
            } catch {
              parsed = rawValue;
            }
          }

          return { value: parsed, ttlSeconds: ttl };
        }
      );

      logger.info(
        { redisKey: rawKey, found: value !== null },
        "Poke cache lookup performed"
      );

      return res.status(200).json({
        key: rawKey,
        value,
        ttlSeconds,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
