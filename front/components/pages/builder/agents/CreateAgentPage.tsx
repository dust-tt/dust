import { AgentTemplateGrid } from "@app/components/agent_builder/AgentTemplateGrid";
import { AgentTemplateModal } from "@app/components/agent_builder/AgentTemplateModal";
import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import {
  useSetContentWidth,
  useSetHideSidebar,
  useSetTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useYAMLUpload } from "@app/hooks/useYAMLUpload";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useAssistantTemplates } from "@app/lib/swr/assistants";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import { removeParamFromRouter } from "@app/lib/utils/router_util";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import {
  isTemplateTagCodeArray,
  TEMPLATES_TAGS_CONFIG,
} from "@app/types/assistant/templates";
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
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export function CreateAgentPage() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const templateTagsMapping = TEMPLATES_TAGS_CONFIG;
  const initialTemplateId = useSearchParam("templateId");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<TemplateTagCodeType[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialTemplateId
  );
  const { isUploading: isUploadingYAML, triggerYAMLUpload } = useYAMLUpload({
    owner,
  });

  const { hasFeature } = useFeatureFlags();
  const { isAdmin } = useAuth();
  const hasCopilot = hasFeature("agent_builder_copilot") && isAdmin;
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
          template.userFacingDescription?.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });

    const tags = getUniqueTemplateTags(validTemplates);

    return { filteredTemplates: filtered, availableTags: tags };
  }, [assistantTemplates, selectedTags, searchTerm]);

  const openTemplateModal = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    await router.replace(
      { pathname: router.pathname, query: { wId: owner.sId, templateId } },
      undefined,
      { shallow: true }
    );
  };

  const closeTemplateModal = async () => {
    setSelectedTemplateId(null);
    await removeParamFromRouter(router, "templateId");
  };

  const handleTagClick = (tagName: TemplateTagCodeType) => {
    setSelectedTags((prevTags) =>
      prevTags.includes(tagName)
        ? prevTags.filter((tag) => tag !== tagName)
        : [...prevTags, tagName]
    );
  };

  const title: ReactNode = useMemo(
    () => (
      <AppLayoutSimpleCloseTitle
        title="Create an Agent"
        onClose={async () => {
          await appLayoutBack(owner, router);
        }}
      />
    ),
    [owner, router]
  );

  useSetContentWidth("centered");
  useSetHideSidebar(true);
  useSetTitle(title);

  return (
    <div id="pageContent">
      <Page variant="modal">
        <div className="flex flex-col gap-6">
          {hasCopilot ? (
            <Page.Header
              title="Start with a template"
              description="Explore different ways to use Dust. Find a setup that works for you and make it your own."
            />
          ) : (
            <>
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
            </>
          )}

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
                  hasCopilot={hasCopilot}
                  onTemplateClick={(id) =>
                    router.push(
                      getAgentBuilderRoute(owner.sId, "new", `templateId=${id}`)
                    )
                  }
                />
              </div>
            </>
          )}
        </div>
      </Page>
      {!hasCopilot && (
        <AgentTemplateModal
          owner={owner}
          templateId={selectedTemplateId}
          onClose={closeTemplateModal}
        />
      )}
    </div>
  );
}
