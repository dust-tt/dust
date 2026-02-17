import logger from "@app/logger/logger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

const StatusPageComponentCodec = t.type({
  name: t.string,
});

const StatusPageUnresolvedIncident = t.type({
  name: t.string,
  incident_updates: t.array(
    t.type({
      body: t.string,
    })
  ),
  shortlink: t.string,
  components: t.array(StatusPageComponentCodec),
});

const StatusPageResponseSchema = t.array(StatusPageUnresolvedIncident);

export type StatusPageIncidentType = t.TypeOf<
  typeof StatusPageUnresolvedIncident
>;

type StatusPageReponseType = StatusPageIncidentType[];

export async function getUnresolvedIncidents({
  apiToken,
  pageId,
}: {
  apiToken: string;
  pageId: string;
}): Promise<StatusPageReponseType> {
  try {
    // eslint-disable-next-line no-restricted-globals
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
