import {
  Button,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TrashIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useEffect, useReducer, useState } from "react";

import { DeleteStaticDataSourceDialog } from "@app/components/data_source/DeleteStaticDataSourceDialog";
import { SpaceWebsiteForm } from "@app/components/spaces/websites/SpaceWebsiteForm";
import { useSendNotification } from "@app/hooks/useNotification";
import { createWebsite, updateWebsite } from "@app/lib/api/website";
import { useDataSourceViewConnectorConfiguration } from "@app/lib/swr/data_source_views";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import { urlToDataSourceName } from "@app/lib/webcrawler";
import type {
  DataSourceViewType,
  SpaceType,
  WebCrawlerConfigurationType,
  WebsiteFormAction,
  WebsiteFormState,
  WorkspaceType,
} from "@app/types";
import {
  isDataSourceNameValid,
  isWebCrawlerConfiguration,
  validateUrl,
  WEBCRAWLER_DEFAULT_CONFIGURATION,
  WEBCRAWLER_MAX_PAGES,
} from "@app/types";

const WEBSITE_CAT = "website";

function getInitialFormState(
  config: WebCrawlerConfigurationType | null,
  name: string
): WebsiteFormState {
  return {
    url: config?.url ?? "",
    name,
    maxPages:
      config?.maxPageToCrawl ?? WEBCRAWLER_DEFAULT_CONFIGURATION.maxPageToCrawl,
    depth: config?.depth ?? WEBCRAWLER_DEFAULT_CONFIGURATION.depth,
    crawlMode: config?.crawlMode ?? WEBCRAWLER_DEFAULT_CONFIGURATION.crawlMode,
    crawlFrequency:
      config?.crawlFrequency ?? WEBCRAWLER_DEFAULT_CONFIGURATION.crawlFrequency,
    headers: config?.headers
      ? Object.entries(config.headers).map(([k, v]) => ({ key: k, value: v }))
      : [],
    errors: {},
  };
}

function validateFormName(
  name: string,
  spaceDataSourceViews: DataSourceViewType[],
  currentViewId?: string
) {
  if (!name.length) {
    return "Please provide a name.";
  }
  const nameValidation = isDataSourceNameValid(name);
  if (nameValidation.isErr()) {
    return nameValidation.error;
  }
  const nameExists = spaceDataSourceViews.some(
    (view) =>
      view.dataSource.name.toLowerCase() === name.toLowerCase() &&
      view.sId !== currentViewId
  );
  return nameExists ? "A website with this name already exists" : undefined;
}

type ValidationResult = {
  isValid: boolean;
  errors: WebsiteFormState["errors"];
};

function validateFormState(
  state: WebsiteFormState,
  spaceDataSourceViews: DataSourceViewType[],
  currentViewId?: string
): ValidationResult {
  const urlValidation = validateUrl(state.url);
  const errors: WebsiteFormState["errors"] = {
    url: !urlValidation.valid
      ? "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))."
      : undefined,
    name: validateFormName(state.name, spaceDataSourceViews, currentViewId),
  };
  return { isValid: urlValidation.valid && !errors.name, errors };
}

function buildWebCrawlerConfig(
  state: WebsiteFormState,
  validatedUrl: { standardized: string }
): WebCrawlerConfigurationType {
  return {
    url: validatedUrl.standardized,
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    maxPageToCrawl: state.maxPages || WEBCRAWLER_MAX_PAGES,
    depth: state.depth,
    crawlMode: state.crawlMode,
    crawlFrequency: state.crawlFrequency,
    headers: state.headers.reduce(
      (acc, { key, value }) => {
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    ),
  };
}

export interface SpaceWebsiteModalProps {
  dataSourceView: DataSourceViewType | null;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
  space: SpaceType;
  canWriteInSpace: boolean;
}

export default function SpaceWebsiteModal({
  dataSourceView,
  isOpen,
  onClose,
  owner,
  space,
  canWriteInSpace,
}: SpaceWebsiteModalProps) {
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const { configuration, mutateConfiguration, isConfigurationLoading } =
    useDataSourceViewConnectorConfiguration({ dataSourceView, owner });

  const {
    spaceDataSourceViews,
    mutateRegardlessOfQueryParams: mutateSpaceDataSourceViews,
  } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: space.sId,
    category: WEBSITE_CAT,
  });

  const webCrawlerConfiguration = isWebCrawlerConfiguration(configuration)
    ? configuration
    : null;

  const formReducer = (
    state: WebsiteFormState,
    action: WebsiteFormAction
  ): WebsiteFormState => {
    switch (action.type) {
      case "SET_FIELD": {
        const newState = { ...state, [action.field]: action.value };
        if (action.field === "url" && !webCrawlerConfiguration) {
          const validated = validateUrl(action.value);
          if (validated.valid) {
            const name = urlToDataSourceName(action.value);
            if (space.kind !== "global") {
              newState.name = `${name} (${space.name})`;
            } else {
              newState.name = name;
            }
          }
        }
        return newState;
      }
      case "SET_ERROR":
        return {
          ...state,
          errors: { ...state.errors, [action.field]: action.value },
        };
      case "RESET":
        return getInitialFormState(action.config ?? null, action.name ?? "");
      case "VALIDATE": {
        const result = validateFormState(
          state,
          spaceDataSourceViews,
          dataSourceView?.sId
        );
        return { ...state, errors: result.errors };
      }
      default:
        return state;
    }
  };

  const [formState, dispatch] = useReducer(
    formReducer,
    getInitialFormState(
      webCrawlerConfiguration,
      dataSourceView ? dataSourceView.dataSource.name : ""
    )
  );

  useEffect(() => {
    dispatch({
      type: "RESET",
      config: webCrawlerConfiguration,
      name: dataSourceView ? dataSourceView.dataSource.name : "",
    });
  }, [webCrawlerConfiguration, dataSourceView]);

  const handleSubmit = async () => {
    dispatch({ type: "VALIDATE" });
    const validation = validateFormState(
      formState,
      spaceDataSourceViews,
      dataSourceView?.sId
    );
    if (!validation.isValid) {
      return;
    }
    setIsSaving(true);
    const trimmedUrl = formState.url.trim();
    const validatedUrl = validateUrl(trimmedUrl);
    if (!validatedUrl.valid) {
      setIsSaving(false);
      return;
    }
    const config = buildWebCrawlerConfig(formState, validatedUrl);
    try {
      if (dataSourceView) {
        await updateWebsite(
          owner.sId,
          space.sId,
          dataSourceView.dataSource.sId,
          config
        );
        void mutateConfiguration();
      } else {
        await createWebsite(owner.sId, space.sId, formState.name, config);
      }
      sendNotification({
        title: `Website ${dataSourceView ? "updated" : "created"}`,
        type: "success",
        description: `The website has been successfully ${dataSourceView ? "updated" : "created"}.`,
      });
      void mutateSpaceDataSourceViews();
      onClose();
      dispatch({ type: "RESET", config: null });
    } catch (err) {
      sendNotification({
        title: `Error ${dataSourceView ? "updating" : "creating"} website`,
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!dataSourceView) {
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSourceView.dataSource.sId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const errRes = await res.json();
        throw new Error(errRes.error.message);
      }
      void mutateSpaceDataSourceViews();
      await router.push(
        `/w/${owner.sId}/spaces/${space.sId}/categories/${WEBSITE_CAT}`
      );
      onClose();
    } catch (err) {
      sendNotification({
        title: "Error deleting website",
        type: "error",
        description: err instanceof Error ? err.message : "An error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {dataSourceView
              ? `Edit ${dataSourceView.dataSource.name}`
              : "Create a website"}
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <SpaceWebsiteForm
            state={formState}
            dispatch={dispatch}
            isConfigurationLoading={isConfigurationLoading}
            webCrawlerConfiguration={webCrawlerConfiguration}
            owner={owner}
          />
          {webCrawlerConfiguration && dataSourceView && (
            <DeleteSection
              isOpen={isDeleteModalOpen}
              onOpenChange={setIsDeleteModalOpen}
              onDelete={handleDelete}
              owner={owner}
              dataSource={dataSourceView.dataSource}
            />
          )}
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Save",
            onClick: async (event: Event) => {
              event.preventDefault();
              await handleSubmit();
            },
            disabled: !canWriteInSpace || isSaving,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

type DeleteSectionProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
  owner: WorkspaceType;
  dataSource: DataSourceViewType["dataSource"];
};

function DeleteSection({
  isOpen,
  onOpenChange,
  onDelete,
  owner,
  dataSource,
}: DeleteSectionProps) {
  return (
    <div className="flex justify-end">
      <Button
        variant="warning"
        icon={TrashIcon}
        label="Delete this website"
        onClick={() => onOpenChange(true)}
      />
      <DeleteStaticDataSourceDialog
        owner={owner}
        dataSource={dataSource}
        handleDelete={onDelete}
        isOpen={isOpen}
        onClose={() => onOpenChange(false)}
      />
    </div>
  );
}
