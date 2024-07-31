import type { KeyType, WithAPIErrorResponse } from "@dust-tt/types";
import { group } from "console";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { apiError } from "@app/logger/withlogging";

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};

const CreateKeyPostBodySchema = t.type({
  name: t.string,
  group_id: t.union([t.string, t.null]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetKeysResponseBody | PostKeysResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.user();

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  const owner = auth.getNonNullableWorkspace();

  switch (req.method) {
    case "GET":
      const keys = await KeyResource.listNonSystemKeysByWorkspace(owner);

      res.status(200).json({
        keys: keys.map((k) => k.toJSON()),
      });

      return;

    case "POST":
      const bodyValidation = CreateKeyPostBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const { name, group_id } = bodyValidation.right;
      const group = group_id
        ? await GroupResource.fetchById(auth, group_id)
        : await GroupResource.fetchWorkspaceGlobalGroup(auth);

      const key = await KeyResource.makeNew({
        name: name,
        status: "active",
        userId: user?.id,
        groupId: group?.id,
        workspaceId: owner.id,
        isSystem: false,
      });

      res.status(201).json({
        key: key.toJSON(),
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
