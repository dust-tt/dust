import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { withLogging } from "@connectors/logger/withlogging";

interface GraphWebhookNotification {
  value: GraphWebhookNotificationValue[];
  validationToken?: string; // Present only during validation phase
}

interface GraphWebhookNotificationValue {
  subscriptionId: string; // Identifier for the subscription
  clientState?: string; // Client state originally specified during subscription creation
  changeType: string; // Type of change that triggered the notification (e.g., "created", "updated", "deleted")
  resource: string; // The resource that was changed
  resourceData: {
    id: string; // Identifier of the resource that has changed
    "@odata.type": string; // The OData type of the resource
    "@odata.id": string; // The OData ID of the resource
    "@odata.etag"?: string; // ETag value for the resource, if applicable
    eventTime: string; // Time when the event occurred
  };
  tenantId: string; // Identifier of the tenant where the change occurred
}

type GraphWebhookResBody = WithConnectorsAPIErrorReponse<null>;

const _webhookMicrosoftAPIHandler = async (
  req: Request<
    Record<string, string>,
    GraphWebhookResBody,
    GraphWebhookNotification
  >,
  res: Response<GraphWebhookResBody | string>
) => {
  console.log("Microsoft API Handler", req);
  const validationToken = req.query.validationToken as string;
  console.log("Validation token", validationToken);
  if (validationToken) {
    console.log("Validating webhook");
    res.type("text/plain").send(validationToken);
  }

  return res.status(200).end();
};

export const webhookMicrosoftAPIHandler = withLogging(
  _webhookMicrosoftAPIHandler
);
