import { BrandColorPalette } from "@app/components/branding/BrandColorPalette";
import { BrandPlaybookPreview } from "@app/components/branding/BrandPlaybookPreview";
import { BrandTypographyEditor } from "@app/components/branding/BrandTypographyEditor";
import { BRANDBOOK_NAME_PREFIX } from "@app/lib/data_sources";
import { serializeBrandPlaybook } from "@app/lib/brandbook_serializer";
import { DEFAULT_BRAND_PLAYBOOK } from "@app/types/brandbook";
import type { BrandPlaybookType } from "@app/types/brandbook";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  EyeIcon,
  Input,
  PaintIcon,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useState } from "react";

interface BrandbookCreationModalProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (dataSourceName: string) => void;
}

type TabId = "identity" | "colors" | "typography" | "voice" | "preview";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType }> = [
  { id: "identity", label: "Identity", icon: DocumentTextIcon },
  { id: "colors", label: "Colors", icon: PaintIcon },
  { id: "typography", label: "Typography", icon: BookOpenIcon },
  { id: "voice", label: "Voice", icon: ChatBubbleLeftRightIcon },
  { id: "preview", label: "Preview", icon: EyeIcon },
];

export function BrandbookCreationModal({
  owner,
  space,
  isOpen,
  onClose,
  onCreated,
}: BrandbookCreationModalProps) {
  const [playbook, setPlaybook] =
    useState<BrandPlaybookType>(DEFAULT_BRAND_PLAYBOOK);
  const [activeTab, setActiveTab] = useState<TabId>("identity");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataSourceName = playbook.brand.name.trim()
    ? `${BRANDBOOK_NAME_PREFIX} ${playbook.brand.name.trim()}`
    : "";

  // ── Partial updaters ─────────────────────────────────────────────────────

  const updateBrand = useCallback(
    (patch: Partial<BrandPlaybookType["brand"]>) => {
      setPlaybook((prev) => ({ ...prev, brand: { ...prev.brand, ...patch } }));
    },
    []
  );

  const updateIdentity = useCallback(
    (patch: Partial<BrandPlaybookType["identity"]>) => {
      setPlaybook((prev) => ({
        ...prev,
        identity: { ...prev.identity, ...patch },
      }));
    },
    []
  );

  const updateVoice = useCallback(
    (patch: Partial<BrandPlaybookType["voice"]>) => {
      setPlaybook((prev) => ({ ...prev, voice: { ...prev.voice, ...patch } }));
    },
    []
  );

  // ── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!playbook.brand.name.trim()) {
      setError("Brand name is required.");
      setActiveTab("identity");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1 — Create the data source (folder).
      const createResponse = await fetch(
        `/api/w/${owner.sId}/spaces/${space.sId}/data_sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dataSourceName,
            description: `Brand guidelines for ${playbook.brand.name.trim()}`,
            assistantDefaultSelected: true,
          }),
        }
      );

      if (!createResponse.ok) {
        const body = await createResponse.json();
        throw new Error(body.error?.message ?? "Failed to create brandbook.");
      }

      const { dataSource } = await createResponse.json();

      // Step 2 — Upload each document from the serializer sequentially (BACK7).
      const documents = serializeBrandPlaybook(playbook);
      for (const doc of documents) {
        await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/documents/${doc.documentId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: doc.title,
              text: doc.text,
              tags: doc.tags,
              source_url: doc.source_url,
            }),
          }
        );
      }

      onCreated(dataSourceName);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setPlaybook(DEFAULT_BRAND_PLAYBOOK);
    setActiveTab("identity");
    setError(null);
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            <div className="s-flex s-items-center s-gap-2">
              <BookOpenIcon className="s-h-5 s-w-5" />
              Create a Brandbook
            </div>
          </SheetTitle>
        </SheetHeader>

        <SheetContainer>
          <Page.P>
            A Brandbook is a knowledge base your agents consult to apply your
            brand's voice, visual identity, and messaging consistently. Fill in
            the sections below — each will be stored as a separate document for
            precise retrieval.
          </Page.P>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TabId)}
          >
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </TabsList>

            {/* ── Identity tab ── */}
            <TabsContent value="identity">
              <div className="s-flex s-flex-col s-gap-4 s-pt-4">
                <div className="s-flex s-flex-col s-gap-1">
                  <Input
                    label="Brand name *"
                    value={playbook.brand.name}
                    onChange={(e) => updateBrand({ name: e.target.value })}
                    placeholder="e.g. Acme Corp, PlayHub, Studio Noir…"
                  />
                  {dataSourceName && (
                    <p className="s-text-xs s-text-muted-foreground">
                      Will be created as:{" "}
                      <code className="s-rounded s-bg-muted s-px-1">
                        {dataSourceName}
                      </code>
                    </p>
                  )}
                </div>

                <Input
                  label="Tagline"
                  value={playbook.brand.tagline}
                  onChange={(e) => updateBrand({ tagline: e.target.value })}
                  placeholder="e.g. Your brand deserves better than DIY."
                />

                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Mission
                  </p>
                  <TextArea
                    value={playbook.brand.mission}
                    onChange={(e) => updateBrand({ mission: e.target.value })}
                    placeholder="Describe what drives your brand and what you're here to do."
                    minRows={3}
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Positioning
                  </p>
                  <TextArea
                    value={playbook.brand.positioning}
                    onChange={(e) =>
                      updateBrand({ positioning: e.target.value })
                    }
                    placeholder="How do you stand out? What's your unique value proposition?"
                    minRows={3}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Colors tab ── */}
            <TabsContent value="colors">
              <div className="s-flex s-flex-col s-gap-4 s-pt-4">
                <BrandColorPalette
                  colors={playbook.identity.colors}
                  onChange={(colors) => updateIdentity({ colors })}
                />
              </div>
            </TabsContent>

            {/* ── Typography tab ── */}
            <TabsContent value="typography">
              <div className="s-flex s-flex-col s-gap-4 s-pt-4">
                <BrandTypographyEditor
                  typography={playbook.identity.typography}
                  onChange={(typography) => updateIdentity({ typography })}
                />
              </div>
            </TabsContent>

            {/* ── Voice tab ── */}
            <TabsContent value="voice">
              <div className="s-flex s-flex-col s-gap-4 s-pt-4">
                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Tone of voice
                  </p>
                  <TextArea
                    value={playbook.voice.tone}
                    onChange={(e) => updateVoice({ tone: e.target.value })}
                    placeholder="How does your brand speak? e.g. 'Direct and warm. No corporate jargon. Short sentences.'"
                    minRows={3}
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Key messages
                  </p>
                  <TextArea
                    value={playbook.voice.keyMessages}
                    onChange={(e) =>
                      updateVoice({ keyMessages: e.target.value })
                    }
                    placeholder="Your main taglines and recurring messages."
                    minRows={3}
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Do ✓
                  </p>
                  <TextArea
                    value={playbook.voice.doList}
                    onChange={(e) => updateVoice({ doList: e.target.value })}
                    placeholder="One item per line. e.g.&#10;Use active voice&#10;Be concise"
                    minRows={3}
                  />
                </div>

                <div className="s-flex s-flex-col s-gap-1">
                  <p className="s-text-sm s-font-medium s-text-foreground">
                    Don't ✗
                  </p>
                  <TextArea
                    value={playbook.voice.dontList}
                    onChange={(e) => updateVoice({ dontList: e.target.value })}
                    placeholder="One item per line. e.g.&#10;Avoid jargon&#10;Don't use passive voice"
                    minRows={3}
                  />
                </div>
              </div>
            </TabsContent>

            {/* ── Preview tab ── */}
            <TabsContent value="preview">
              <div className="s-pt-4">
                <BrandPlaybookPreview playbook={playbook} />
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <p className="s-mt-4 s-text-sm s-text-warning" role="alert">
              {error}
            </p>
          )}
        </SheetContainer>

        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
            disabled: isSubmitting,
          }}
          rightButtonProps={{
            label: isSubmitting ? "Creating…" : "Create Brandbook",
            onClick: handleSubmit,
            disabled: !playbook.brand.name.trim() || isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
