import {
  Button,
  DocumentIcon,
  FolderOpenIcon,
  Icon,
  MagicIcon,
  Page,
  PencilSquareIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";

import { AgentTemplateGrid } from "@app/components/agent_builder/AgentTemplateGrid";
import { AgentTemplateModal } from "@app/components/agent_builder/AgentTemplateModal";
import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAssistantTemplates } from "@app/lib/swr/assistants";
import {
  useFeatureFlags,
  useWorkspaceAuthContext,
} from "@app/lib/swr/workspaces";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import type {
  SubscriptionType,
  TemplateTagCodeType,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import {
  isBuilder,
  isString,
  isTemplateTagCodeArray,
  TEMPLATES_TAGS_CONFIG,
} from "@app/types";

function FullPageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}

export default function CreateAgentPage() {
  const router = useRouter();
  const owner = useWorkspace();

  if (!router.isReady) {
    return null;
  }

  if (!owner) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  return <CreateAgentAuthGate workspaceId={owner.sId} />;
}

interface CreateAgentAuthGateProps {
  workspaceId: string;
}

function CreateAgentAuthGate({ workspaceId }: CreateAgentAuthGateProps) {
  const router = useRouter();
  const {
    owner,
    subscription,
    user,
    isAuthContextLoading,
    isAuthContextError,
  } = useWorkspaceAuthContext({ workspaceId });

  if (isAuthContextLoading) {
    return <FullPageSpinner />;
  }

  if (isAuthContextError || !owner || !subscription || !user) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  return <CreateAgentFeatureGate owner={owner} subscription={subscription} />;
}

interface CreateAgentFeatureGateProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

function CreateAgentFeatureGate({
  owner,
  subscription,
}: CreateAgentFeatureGateProps) {
  const router = useRouter();
  const { featureFlags, hasFeature, isFeatureFlagsLoading } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  if (isFeatureFlagsLoading) {
    return <FullPageSpinner />;
  }

  const isRestrictedFromAgentCreation =
    featureFlags.includes("disallow_agent_creation_to_users") &&
    !isBuilder(owner);

  if (isRestrictedFromAgentCreation) {
    void router.replace("/404");
    return <FullPageSpinner />;
  }

  return (
    <CreateAgentContent
      owner={owner}
      subscription={subscription}
      hasFeature={hasFeature}
    />
  );
}

interface CreateAgentContentProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  hasFeature: (flag: WhitelistableFeature | null | undefined) => boolean;
}

function CreateAgentContent({
  owner,
  subscription,
  hasFeature,
}: CreateAgentContentProps) {
  const router = useRouter();
  const { templateId } = router.query;

  const selectedTemplateId = isString(templateId) ? templateId : null;
  const templateTagsMapping = TEMPLATES_TAGS_CONFIG;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<TemplateTagCodeType[]>([]);
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });

  const { assistantTemplates } = useAssistantTemplates();

  const { filteredTemplates, availableTags } = useMemo(() => {
    const validTemplates = assistantTemplates.filter((template) =>
      isTemplateTagCodeArray(template.tags)
    );

    const filtered = validTemplates.filter((template) => {
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => template.tags.includes(tag))
      ) {
        return false;
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        return (
          template.handle.toLowerCase().includes(searchLower) ||
          template.description?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    const tags = getUniqueTemplateTags(validTemplates);

    return { filteredTemplates: filtered, availableTags: tags };
  }, [assistantTemplates, selectedTags, searchTerm]);

  const openTemplateModal = async (templateId: string) => {
    await router.replace(
      { pathname: router.pathname, query: { wId: owner.sId, templateId } },
      undefined,
      { shallow: true }
    );
  };

  const closeTemplateModal = async () => {
    await removeParamFromRouter(router, "templateId");
  };

  const handleTagClick = (tagName: TemplateTagCodeType) => {
    setSelectedTags((prevTags) =>
      prevTags.includes(tagName)
        ? prevTags.filter((tag) => tag !== tagName)
        : [...prevTags, tagName]
    );
  };

  return (
    <AppCenteredLayout
      subscription={subscription}
      hideSidebar
      owner={owner}
      title={
        <AppLayoutSimpleCloseTitle
          title="Create an Agent"
          onClose={async () => {
            await appLayoutBack(owner, router);
          }}
        />
      }
    >
      <div id="pageContent">
        <Page variant="modal">
          <div className="flex flex-col gap-6">
            <div className="flex min-h-[20vh] flex-col justify-end gap-6">
              <div className="flex flex-row items-center gap-2">
                <Icon
                  visual={PencilSquareIcon}
                  size="lg"
                  className="text-primary-400 dark:text-primary-500"
                />
                <Page.Header title="Start new" />
              </div>
              <div className="flex flex-row gap-3">
                <Button
                  icon={DocumentIcon}
                  label="New Agent"
                  data-gtm-label="assistantCreationButton"
                  data-gtm-location="assistantCreationPage"
                  size="md"
                  variant="highlight"
                  href={`/w/${owner.sId}/builder/agents/new`}
                />
                {hasFeature("agent_to_yaml") && (
                  <Button
                    icon={
                      isUploadingYAML
                        ? () => <Spinner size="xs" />
                        : FolderOpenIcon
                    }
                    label={
                      isUploadingYAML ? "Uploading..." : "Upload from YAML"
                    }
                    data-gtm-label="yamlUploadButton"
                    data-gtm-location="assistantCreationPage"
                    size="md"
                    variant="outline"
                    disabled={isUploadingYAML}
                    onClick={triggerYAMLUpload}
                  />
                )}
              </div>
            </div>

            <Page.Separator />

            <div className="flex flex-row items-center gap-2">
              <Icon
                visual={MagicIcon}
                size="lg"
                className="text-primary-400 dark:text-primary-500"
              />
              <Page.Header title="Start from a template" />
            </div>

            <div className="flex flex-col gap-6">
              <SearchInput
                placeholder="Search templates"
                name="input"
                value={searchTerm}
                onChange={setSearchTerm}
              />
              <div className="flex flex-row flex-wrap gap-2">
                {availableTags.map((tagName) => (
                  <Button
                    label={templateTagsMapping[tagName].label}
                    variant={
                      selectedTags.includes(tagName) ? "primary" : "outline"
                    }
                    key={tagName}
                    size="xs"
                    onClick={() => handleTagClick(tagName)}
                  />
                ))}
              </div>
            </div>
            {filteredTemplates.length > 0 && (
              <>
                <Page.Separator />
                <div className="flex flex-col pb-56">
                  <AgentTemplateGrid
                    templates={filteredTemplates}
                    openTemplateModal={openTemplateModal}
                    templateTagsMapping={templateTagsMapping}
                    selectedTags={selectedTags}
                  />
                </div>
              </>
            )}
          </div>
        </Page>
        <AgentTemplateModal
          owner={owner}
          templateId={selectedTemplateId}
          onClose={closeTemplateModal}
        />
      </div>
    </AppCenteredLayout>
  );
}

function getLayout(page: ReactElement) {
  return <AppRootLayout>{page}</AppRootLayout>;
}

CreateAgentPage.getLayout = getLayout;
