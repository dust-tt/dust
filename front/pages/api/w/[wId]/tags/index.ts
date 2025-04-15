import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TagResource } from "@app/lib/resources/tags_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TagType } from "@app/types/tag";

export type GetTagsResponseBody = {
  tags: TagType[];
};

export type CreateTagResponseBody = {
  tag: TagType;
};

const PostBodySchema = t.type({
  name: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTagsResponseBody | CreateTagResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { method } = req;

  switch (method) {
    case "GET": {
      const tags = await TagResource.findAll(auth);

      return res.status(200).json({
        tags: tags.map((tag) => tag.toJSON()),
      });
    }
    case "POST": {
      const r = PostBodySchema.decode(req.body);

      if (isLeft(r)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const body = r.right;
      const { name } = body;

      const existingTag = await TagResource.findByName(auth, name);

      if (existingTag) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "A tag with this name already exists",
          },
        });
      }

      const newTag = await TagResource.makeNew(auth, {
        name,
      });

      return res.status(201).json({
        tag: newTag.toJSON(),
      });
    }
    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
