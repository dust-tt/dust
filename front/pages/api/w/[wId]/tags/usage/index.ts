import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TagTypeWithUsage } from "@app/types/tag";

export type GetTagsUsageResponseBody = {
  tags: TagTypeWithUsage[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTagsUsageResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const tagsWithUsage = await TagResource.findAllWithUsage(auth);

      return res.status(200).json({
        tags: tagsWithUsage,
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
