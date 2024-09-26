import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { PokeItemBase } from "@dust-tt/types/dist/front/lib/poke";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { searchPokeResources } from "@app/lib/poke/search";
import { apiError } from "@app/logger/withlogging";

export type GetPokeSearchItemsResponseBody = {
  results: PokeItemBase[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetPokeSearchItemsResponseBody>>,
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

  const { search } = req.query;
  if (typeof search !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The search query parameter is required.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const results = await searchPokeResources(auth, search);

      return res.status(200).json({ results });

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

export default withSessionAuthentication(handler);
