/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { isWhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetPokeFeaturesResponseBody = {
  features: {
    name: WhitelistableFeature;
    createdAt: string;
    groups: { id: number; title: string }[] | null;
  }[];
};

export type CreateOrDeleteFeatureFlagResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      CreateOrDeleteFeatureFlagResponseBody | GetPokeFeaturesResponseBody
    >
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const { name: flag } = req.body;
  if (flag && !isWhitelistableFeature(flag)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid feature flag name.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const flags = await FeatureFlagResource.listForWorkspace(owner);

      // Collect all unique group IDs across all flags to resolve names.
      const allGroupIds = new Set<ModelId>();
      for (const f of flags) {
        if (f.groupIds) {
          for (const gId of f.groupIds) {
            allGroupIds.add(gId);
          }
        }
      }

      const groupMap = new Map<ModelId, { id: ModelId; title: string }>();
      if (allGroupIds.size > 0) {
        const groups = await GroupResource.fetchByModelIds(auth, [
          ...allGroupIds,
        ]);
        for (const g of groups) {
          groupMap.set(g.id, { id: g.id, title: g.name });
        }
      }

      const features = flags.map((f) => ({
        name: f.name,
        createdAt: f.createdAt.toISOString(),
        groups: f.groupIds
          ? f.groupIds.map(
              (gId) =>
                groupMap.get(gId) ?? { id: gId, title: `Unknown (${gId})` }
            )
          : null,
      }));

      return res.status(200).json({ features });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
