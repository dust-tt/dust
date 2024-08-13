import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import logger from "@app/logger/logger";

const StatusPageUnresolvedIncident = t.type({
  name: t.string,
  incident_updates: t.array(
    t.type({
      body: t.string,
    })
  ),
  shortlink: t.string,
});

const StatusPageResponseSchema = t.array(StatusPageUnresolvedIncident);

type StatusPageReponseType = t.TypeOf<typeof StatusPageResponseSchema>;

export async function getUnresolvedIncidents({
  apiToken,
  pageId,
}: {
  apiToken: string;
  pageId: string;
}): Promise<StatusPageReponseType> {
  try {
    const res = await fetch(
      `https://api.statuspage.io/v1/pages/${pageId}/incidents/unresolved`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `OAuth ${apiToken}`,
        },
        method: "GET",
      }
    );

    const data = await res.json();

    const validation = StatusPageResponseSchema.decode(data);
    if (isLeft(validation)) {
      const pathError = reporter.formatValidationErrors(validation.left);
      logger.error({ pathError }, "Could not parse status page response");

      return [];
    }

    const { right: incidents } = validation;

    return incidents;
  } catch (err) {
    logger.error({ err }, "Error fetching provider status");
    return [];
  }
}
