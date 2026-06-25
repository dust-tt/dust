import { AgentTemplateGrid } from "@app/components/agent_builder/AgentTemplateGrid";
import { getUniqueTemplateTags } from "@app/components/agent_builder/utils";
import {
  useSetContentWidth,
  useSetHideSidebar,
  useSetTitle,
} from "@app/components/sparkle/AppLayoutContext";
import { AppLayoutSimpleCloseTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAssistantTemplates } from "@app/lib/swr/assistants";
import {
  getAgentBuilderRoute,
  getConversationRoute,
} from "@app/lib/utils/router";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import {
  isTemplateTagCodeArray,
  TEMPLATES_TAGS_CONFIG,
} from "@app/types/assistant/templates";
import { Button, Page, SearchInput } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export function CreateAgentPage() {
  const router = useAppRouter();
  const owner = useWorkspace();
  const templateTagsMapping = TEMPLATES_TAGS_CONFIG;

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<TemplateTagCodeType[]>([]);

  const { assistantTemplates } = useAssistantTemplates();

  const { filteredTemplates, availableTags } = useMemo(() => {
    const validTemplates = assistantTemplates.filter(
      (template) =>
        isTemplateTagCodeArray(template.tags) &&
        template.hasSidekickInstructions
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
        onClose={() => {
          if (window.history.state?.idx > 0) {
            router.back();
          } else {
            void router.replace(getConversationRoute(owner.sId));
          }
        }}
      />
    ),
    [owner.sId, router]
  );

  useSetContentWidth("centered");
  useSetHideSidebar(true);
  useSetTitle(title);

  return (
    <div id="pageContent">
      <Page variant="modal">
        <div className="flex flex-col gap-6">
          <Page.Header
            title="Start with a template"
            description="Explore different ways to use Dust. Find a setup that works for you and make it your own."
          />

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
                  templateTagsMapping={templateTagsMapping}
                  selectedTags={selectedTags}
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
    </div>
  );
}
