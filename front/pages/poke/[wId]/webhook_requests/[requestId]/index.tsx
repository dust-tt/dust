import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { ViewWebhookRequestTable } from "@app/components/poke/webhook_requests/view";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { WebhookRequestTriggerModel } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { PokeWebhookRequestType } from "@app/pages/api/poke/workspaces/[wId]/webhook_sources/[webhookSourceId]/requests";

type WebhookRequestTriggerInfo = {
  id: number;
  status: string;
  triggerId: number;
  trigger?: TriggerType;
  errorMessage: string | null;
  createdAt: number;
};

export const getServerSideProps = withSuperUserAuthRequirements<{
  webhookRequest: PokeWebhookRequestType;
  webhookSourceSId: string | null;
  webhookRequestTriggers: WebhookRequestTriggerInfo[];
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { requestId } = context.params || {};
  if (typeof requestId !== "string") {
    return {
      notFound: true,
    };
  }

  const requestIdNum = parseInt(requestId, 10);
  if (isNaN(requestIdNum)) {
    return {
      notFound: true,
    };
  }

  const webhookRequest = await WebhookRequestResource.fetchByModelIdWithAuth(
    auth,
    requestIdNum
  );
  if (!webhookRequest) {
    return {
      notFound: true,
    };
  }

  // Fetch the webhook source to get its sId.
  let webhookSourceSId: string | null = null;
  const webhookSource = await WebhookSourceResource.findByPk(
    auth,
    webhookRequest.webhookSourceId
  );
  if (webhookSource) {
    webhookSourceSId = webhookSource.sId;
  }

  // Fetch webhook request triggers.
  const webhookRequestTriggerModels = await WebhookRequestTriggerModel.findAll({
    where: {
      workspaceId: owner.id,
      webhookRequestId: webhookRequest.id,
    },
    order: [["createdAt", "DESC"]],
  });

  const webhookRequestTriggers: WebhookRequestTriggerInfo[] =
    webhookRequestTriggerModels.map((wrt) => ({
      id: wrt.id,
      status: wrt.status,
      triggerId: wrt.triggerId,
      errorMessage: wrt.errorMessage,
      createdAt: wrt.createdAt.getTime(),
    }));

  return {
    props: {
      webhookRequest: {
        id: webhookRequest.id,
        status: webhookRequest.status,
        webhookSourceId: webhookRequest.webhookSourceId,
        processedAt: webhookRequest.processedAt
          ? webhookRequest.processedAt.getTime()
          : null,
        errorMessage: webhookRequest.errorMessage,
        createdAt: webhookRequest.createdAt.getTime(),
        updatedAt: webhookRequest.updatedAt.getTime(),
      },
      webhookSourceSId,
      webhookRequestTriggers,
      owner,
    },
  };
});

export default function WebhookRequestPage({
  webhookRequest,
  webhookSourceSId,
  webhookRequestTriggers,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold">Webhook Request Overview</h2>
        <ViewWebhookRequestTable webhookRequest={webhookRequest} />
      </div>

      {webhookSourceSId && (
        <div className="border-t border-gray-200 pt-6">
          <h2 className="mb-4 text-lg font-semibold">Webhook Source</h2>
          <Link
            href={`/poke/${owner.sId}/webhook_sources/${webhookSourceSId}`}
            className="text-action-500 hover:text-action-600"
          >
            View Webhook Source ({webhookSourceSId})
          </Link>
        </div>
      )}

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold">
          Trigger Executions ({webhookRequestTriggers.length})
        </h2>
        {webhookRequestTriggers.length > 0 ? (
          <div className="space-y-2">
            {webhookRequestTriggers.map((wrt) => (
              <div
                key={wrt.id}
                className="border-material-200 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">Trigger ID: {wrt.triggerId}</div>
                    <div className="text-element-700 text-sm">
                      Status:{" "}
                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          wrt.status === "workflow_start_succeeded"
                            ? "bg-success-100 text-success-800"
                            : wrt.status === "workflow_start_failed"
                              ? "bg-red-100 text-red-800"
                              : wrt.status === "rate_limited"
                                ? "bg-warning-100 text-warning-800"
                                : "bg-element-100 text-element-800"
                        }`}
                      >
                        {wrt.status}
                      </span>
                    </div>
                    {wrt.errorMessage && (
                      <div className="text-element-700 mt-1 text-sm">
                        Error:{" "}
                        <span className="text-red-800">{wrt.errorMessage}</span>
                      </div>
                    )}
                    <div className="text-element-700 text-sm">
                      {new Date(wrt.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-element-600">
            No trigger executions for this webhook request.
          </p>
        )}
      </div>
    </div>
  );
}

WebhookRequestPage.getLayout = (
  page: ReactElement,
  {
    owner,
    webhookRequest,
  }: {
    owner: WorkspaceType;
    webhookRequest: PokeWebhookRequestType;
    webhookSourceSId: string | null;
    webhookRequestTriggers: WebhookRequestTriggerInfo[];
  }
) => {
  return (
    <PokeLayout title={`${owner.name} - Webhook Request #${webhookRequest.id}`}>
      {page}
    </PokeLayout>
  );
};
