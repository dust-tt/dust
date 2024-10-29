import { Button, PlusIcon, Popup, Tooltip } from "@dust-tt/sparkle";
import type {
  DataSourceType,
  DataSourceViewType,
  PlanType,
  SpaceType,
  WorkspaceType,
} from "@dust-tt/types";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import SpaceFolderModal from "@app/components/spaces/SpaceFolderModal";
import SpaceWebsiteModal from "@app/components/spaces/SpaceWebsiteModal";

interface EditSpaceStaticDatasourcesViewsProps {
  canWriteInSpace: boolean;
  category: "folder" | "website";
  dataSources: DataSourceType[];
  dataSourceView: DataSourceViewType | null;
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
  owner: WorkspaceType;
  plan: PlanType;
  space: SpaceType;
}

export function EditSpaceStaticDatasourcesViews({
  canWriteInSpace,
  category,
  dataSources,
  dataSourceView,
  isOpen,
  onClose,
  onOpen,
  owner,
  plan,
  space,
}: EditSpaceStaticDatasourcesViewsProps) {
  const router = useRouter();
  const [showDatasourceLimitPopup, setShowDatasourceLimitPopup] =
    useState(false);

  const planDataSourcesLimit = plan.limits.dataSources.count;

  const checkLimitsAndOpenModal = useCallback(() => {
    if (
      planDataSourcesLimit !== -1 &&
      dataSources.length >= planDataSourcesLimit
    ) {
      setShowDatasourceLimitPopup(true);
    } else {
      onOpen();
    }
  }, [dataSources.length, planDataSourcesLimit, onOpen]);

  return (
    <>
      <Popup
        show={showDatasourceLimitPopup}
        chipLabel={`${plan.name} plan`}
        description={`You have reached the limit of data sources (${plan.limits.dataSources.count} data sources). Upgrade your plan for unlimited datasources.`}
        buttonLabel="Check Dust plans"
        buttonClick={() => {
          void router.push(`/w/${owner.sId}/subscription`);
        }}
        onClose={() => {
          setShowDatasourceLimitPopup(false);
        }}
        className="absolute bottom-8 right-0"
      />
      {category === "folder" ? (
        <SpaceFolderModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          space={space}
          dataSources={dataSources}
          dataSourceViewId={dataSourceView ? dataSourceView.sId : null}
        />
      ) : category === "website" ? (
        <SpaceWebsiteModal
          isOpen={isOpen}
          onClose={onClose}
          owner={owner}
          space={space}
          dataSources={dataSources}
          dataSourceView={dataSourceView}
        />
      ) : null}
      {canWriteInSpace ? (
        <Button
          label={`Add ${category}`}
          onClick={checkLimitsAndOpenModal}
          icon={PlusIcon}
          disabled={!canWriteInSpace}
        />
      ) : (
        <Tooltip
          label={
            space.kind === "global"
              ? `Only builders of the workspace can add a ${category} in the Company data space.`
              : `Only members of the space can add a ${category}.`
          }
          side="top"
          trigger={
            <Button
              label={`Add ${category}`}
              onClick={checkLimitsAndOpenModal}
              icon={PlusIcon}
              disabled={!canWriteInSpace}
            />
          }
        />
      )}
    </>
  );
}
