import { getFeatureFlags } from "@app/lib/auth";
import type { DocumentUpsertHook } from "@app/lib/document_upsert_hooks/hooks";
import { launchRunDocumentTrackerWorkflow } from "@app/temporal/document_tracker/client";

// this hook is meant to suggest changes to tracked documents
// based on new information that has been added to other documents
// it should run on upserts if the workspace has tracked docs
export const documentTrackerUpsertHook: DocumentUpsertHook = {
  type: "document_tracker",
  fn: async ({
    auth,
    dataSourceId,
    documentId,
    documentHash,
    dataSourceConnectorProvider,
  }) => {
    const owner = auth.workspace();
    if (!owner) {
      return;
    }

    const flags = await getFeatureFlags(owner);
    if (!flags.includes("labs_trackers")) {
      return;
    }

    await launchRunDocumentTrackerWorkflow({
      workspaceId: owner.sId,
      dataSourceId,
      documentId,
      documentHash,
      dataSourceConnectorProvider,
    });
  },
};
