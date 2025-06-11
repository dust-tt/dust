import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { GroupKind, GroupType, WithAPIErrorResponse } from "@app/types";

export type GetGroupsResponseBody = {
  groups: GroupType[];
};

const GroupKindCodec = t.keyof({
  global: null,
  regular: null,
  agent_editors: null,
  system: null,
  provisioned: null,
});

const GetGroupsQuerySchema = t.partial({
  kind: t.union([GroupKindCodec, t.array(GroupKindCodec)]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetGroupsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const queryValidation = GetGroupsQuerySchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${pathError}`,
          },
        });
      }

      const { kind } = queryValidation.right;
      const groupKinds: GroupKind[] = kind
        ? Array.isArray(kind)
          ? kind
          : [kind]
        : ["global", "regular"];

      const groups = await GroupResource.listAllWorkspaceGroups(auth, {
        groupKinds,
      });

      return res.status(200).json({
        groups: groups.map((group) => group.toJSON()),
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

export default withSessionAuthenticationForWorkspace(handler);
