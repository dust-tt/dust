import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { TriggerDataTable } from "@app/components/poke/triggers/table";
import { ViewWebhookSourceViewTable } from "@app/components/poke/webhook_source_views/view";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WebhookSourceViewForAdminType } from "@app/types/triggers/webhooks";

export const getServerSideProps = withSuperUserAuthRequirements<{
  webhookSourceView: WebhookSourceViewForAdminType;
  triggers: TriggerType[];
  owner: LightWorkspaceType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { viewId } = context.params || {};
  if (typeof viewId !== "string") {
    return {
      notFound: true,
    };
  }

  const webhookSourceView = await WebhookSourcesViewResource.fetchById(
    auth,
    viewId
  );
  if (!webhookSourceView) {
    return {
      notFound: true,
    };
  }

  // Fetch all triggers for the workspace and filter by those that use this webhook source view.
  const allTriggers = await TriggerResource.listByWorkspace(auth);
  const triggers = allTriggers.filter(
    (t) => t.webhookSourceViewId === webhookSourceView.id
  );

  return {
    props: {
      webhookSourceView: webhookSourceView.toJSONForAdmin(),
      triggers: triggers.map((t) => t.toJSON()),
      owner,
    },
  };
});

export default function WebhookSourceViewPage({
  webhookSourceView,
  triggers,
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="flex flex-col gap-y-6">
      <div>
        <h2 className="mb-4 text-lg font-semibold">
          Webhook Source View Overview
        </h2>
        <ViewWebhookSourceViewTable
          webhookSourceView={webhookSourceView}
          workspaceId={owner.sId}
        />
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h2 className="mb-4 text-lg font-semibold">
          Associated Triggers ({triggers.length})
        </h2>
        {triggers.length > 0 ? (
          <TriggerDataTable owner={owner} loadOnInit={false} />
        ) : (
          <p className="text-element-600">
            No triggers are currently using this webhook source view.
          </p>
        )}
      </div>
    </div>
  );
}

WebhookSourceViewPage.getLayout = (
  page: ReactElement,
  {
    owner,
    webhookSourceView,
  }: {
    owner: WorkspaceType;
    webhookSourceView: WebhookSourceViewForAdminType;
    triggers: TriggerType[];
  }
) => {
  return (
    <PokeLayout
      title={`${owner.name} - Webhook Source View - ${webhookSourceView.customName}`}
    >
      {page}
    </PokeLayout>
  );
};
