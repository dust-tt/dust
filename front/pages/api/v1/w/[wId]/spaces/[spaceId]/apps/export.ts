import type { GetAppsResponseType } from "@dust-tt/client";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { getDatasetHash, getDatasets } from "@app/lib/api/datasets";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getSpecificationFromCore,
  getSpecificationsHashesFromCore,
} from "@app/lib/utils/apps";
import { apiError } from "@app/logger/withlogging";

const extractDatasetIdsAndHashes = (specification: string) => {
  const dataSetsToFetch: { datasetId: string; hash: string }[] = [];
  const dataBlockMatch = specification.match(
    /data [^\n]+\s*{\s*dataset_id:\s*([^\n]+)\s*hash:\s*([^\n]+)\s*}/
  );
  if (dataBlockMatch) {
    const [, datasetId, hash] = dataBlockMatch;
    dataSetsToFetch.push({ datasetId, hash });
  }
  return dataSetsToFetch;
};

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetAppsResponseType>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  if (!space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const apps = await AppResource.listBySpace(auth, space);

      const enhancedApps = await concurrentExecutor(
        apps.filter((app) => app.canRead(auth)),

        async (app) => {
          const specsToFetch = await getSpecificationsHashesFromCore(app);

          const dataSetsToFetch = (await getDatasets(auth, app.toJSON())).map(
            (ds) => ({ datasetId: ds.name, hash: "latest" })
          );

          const coreSpecifications: { [key: string]: string } = {};

          if (specsToFetch) {
            for (const hash of specsToFetch) {
              const coreSpecification = await getSpecificationFromCore(
                app,
                hash
              );
              if (coreSpecification) {
                // Parse dataset_id and hash from specification if it contains DATA section
                dataSetsToFetch.push(
                  ...extractDatasetIdsAndHashes(coreSpecification.data)
                );

                coreSpecifications[hash] = coreSpecification.data;
              }
            }
          }
          const datasets = [];
          for (const dataset of dataSetsToFetch) {
            const fromCore = await getDatasetHash(
              auth,
              app,
              dataset.datasetId,
              dataset.hash,
              { includeDeleted: true }
            );
            if (fromCore) {
              datasets.push(fromCore);
            }
          }

          return { ...app.toJSON(), datasets, coreSpecifications };
        },
        { concurrency: 5 }
      );

      res.status(200).json({
        apps: enhancedApps,
      });
      return;

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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
