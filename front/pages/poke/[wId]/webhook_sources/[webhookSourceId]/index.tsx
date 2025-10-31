import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { WebhookRequestDataTable } from "@app/components/poke/webhook_requests/table";
import { ViewWebhookSourceTable } from "@app/components/poke/webhook_sources/view";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";
import type {
  WebhookSourceForAdminType,
  WebhookSourceViewForAdminType,
} from "@app/types/triggers/webhooks";

export const getServerSideProps = withSuperUserAuthRequirements<{
  webhookSource: WebhookSourceForAdminType;
  webhookSourceViews: WebhookSourceViewForAdminType[];
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { webhookSourceId } = context.params || {};
  if (typeof webhookSourceId !== "string") {
    return {
      notFound: true,
    };
  }

  const webhookSource = await WebhookSourceResource.fetchById(
    auth,
    webhookSourceId
  );
  if (!webhookSource) {
    return {
      notFound: true,
    };
  }

  const webhookSourceViews =
    await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      webhookSource.id
    );

  return {
    props: {
      webhookSource: webhookSource.toJSONForAdmin(),
      webhookSourceViews: webhookSourceViews.map((wsv) => wsv.toJSONForAdmin()),
      owner,
    },
  };
});

export default function WebhookSourcePage({
  webhookSource,
  webhookSourceViews,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold">Webhook Source Overview</h2>
        <ViewWebhookSourceTable webhookSource={webhookSource} />
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold">
          Webhook Source Views ({webhookSourceViews.length})
        </h2>
        {webhookSourceViews.length > 0 ? (
          <div className="space-y-2">
            {webhookSourceViews.map((view) => (
              <div
                key={view.sId}
                className="border-material-200 rounded-lg border p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{view.customName}</div>
                    <div className="text-element-700 text-sm">
                      sId: {view.sId}
                    </div>
                    <div className="text-element-700 text-sm">
                      Space: {view.spaceId}
                    </div>
                  </div>
                  <a
                    href={`/poke/${owner.sId}/webhook_source_views/${view.sId}`}
                    className="text-action-500 hover:text-action-600 text-sm"
                  >
                    View Details →
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-element-600">No views found for this webhook source.</p>
        )}
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold">
          Recent Webhook Requests (Last 100)
        </h2>
        <WebhookRequestDataTable
          owner={owner}
          webhookSourceId={webhookSource.sId}
        />
      </div>
    </div>
  );
}

WebhookSourcePage.getLayout = (
  page: ReactElement,
  {
    owner,
    webhookSource,
  }: {
    owner: WorkspaceType;
    webhookSource: WebhookSourceForAdminType;
    webhookSourceViews: WebhookSourceViewForAdminType[];
  }
) => {
  return (
    <PokeLayout title={`${owner.name} - Webhook Source - ${webhookSource.name}`}>
      {page}
    </PokeLayout>
  );
};
