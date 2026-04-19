import { BRANDBOOK_NAME_PREFIX } from "@app/lib/data_sources";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface BrandbookCreationModalProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (dataSourceName: string) => void;
}

// Sections that make up a brand guideline document.
// Each section becomes a separate document in the Brandbook folder,
// so agents can retrieve only the relevant section.
const BRANDBOOK_SECTIONS = [
  {
    key: "identity",
    label: "Brand Identity",
    placeholder:
      "Describe who you are as a brand. What values drive you? What's your mission? Example: 'We are a B2B SaaS company that helps designers build faster. Our core values are clarity, boldness and craft.'",
  },
  {
    key: "tone",
    label: "Tone of Voice",
    placeholder:
      "How does your brand speak? Example: 'Direct and warm. We use the informal "you". No corporate jargon. Short sentences. We explain complex things simply without dumbing them down.'",
  },
  {
    key: "messaging",
    label: "Key Messages & Taglines",
    placeholder:
      "Your main taglines and recurring messages. Example: 'Tagline: Your brand deserves better than DIY. Key message: We build brand systems that work at scale.'",
  },
  {
    key: "audience",
    label: "Target Audience",
    placeholder:
      "Who are you talking to? Example: 'Female entrepreneurs aged 25-45. They are ambitious, tech-savvy, and want professional results without big agency budgets.'",
  },
  {
    key: "visual",
    label: "Visual Identity (optional)",
    placeholder:
      "Colors, typography, visual style. Example: 'Primary colors: Lime #D4FF00 on dark backgrounds, Violet #C084FC for highlights. Fonts: Instrument Serif for headlines, Geist Mono for body text.'",
  },
] as const;

type SectionKey = (typeof BRANDBOOK_SECTIONS)[number]["key"];

export function BrandbookCreationModal({
  owner,
  space,
  isOpen,
  onClose,
  onCreated,
}: BrandbookCreationModalProps) {
  const [brandName, setBrandName] = useState("");
  const [sections, setSections] = useState<Partial<Record<SectionKey, string>>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataSourceName = brandName.trim()
    ? `${BRANDBOOK_NAME_PREFIX} ${brandName.trim()}`
    : "";

  const handleSectionChange = (key: SectionKey, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!brandName.trim()) {
      setError("Brand name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create the folder (data source) with the brandbook name prefix.
      const createResponse = await fetch(
        `/api/w/${owner.sId}/spaces/${space.sId}/data_sources`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: dataSourceName,
            description: `Brand guidelines for ${brandName.trim()}`,
            assistantDefaultSelected: true,
          }),
        }
      );

      if (!createResponse.ok) {
        const body = await createResponse.json();
        throw new Error(body.error?.message ?? "Failed to create brandbook.");
      }

      const { dataSource } = await createResponse.json();

      // Step 2: Upload each filled section as a separate document.
      // Separate documents allow agents to retrieve only the relevant section.
      const filledSections = BRANDBOOK_SECTIONS.filter(
        (s) => sections[s.key]?.trim()
      );

      await Promise.all(
        filledSections.map(async (section) => {
          const content = sections[section.key]?.trim() ?? "";
          const documentId = `${section.key}`;
          const title = `${brandName.trim()} — ${section.label}`;

          await fetch(
            `/api/w/${owner.sId}/spaces/${space.sId}/data_sources/${dataSource.sId}/documents/${documentId}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                text: `# ${title}\n\n${content}`,
                tags: ["brandbook", section.key],
                source_url: null,
              }),
            }
          );
        })
      );

      onCreated(dataSourceName);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setBrandName("");
    setSections({});
    setError(null);
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-2">
              <BookOpenIcon className="h-5 w-5" />
              Create a Brandbook
            </div>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <Page.P>
            A Brandbook is a knowledge base your agents can consult to apply
            your brand&apos;s voice, visual identity, and messaging
            consistently. Fill in the sections below — each will be stored as a
            separate document for precise retrieval.
          </Page.P>

          <div className="flex flex-col gap-6 pt-4">
            {/* Brand name */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-foreground">
                Brand name <span className="text-red-500">*</span>
              </label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Acme Corp, PlayHub, Studio Noir…"
              />
              {dataSourceName && (
                <p className="text-xs text-muted-foreground">
                  Will be created as:{" "}
                  <code className="rounded bg-muted px-1">{dataSourceName}</code>
                </p>
              )}
            </div>

            {/* Brand sections */}
            {BRANDBOOK_SECTIONS.map((section) => (
              <div key={section.key} className="flex flex-col gap-1">
                <label className="text-sm font-medium text-foreground">
                  {section.label}
                </label>
                <TextArea
                  value={sections[section.key] ?? ""}
                  onChange={(e) =>
                    handleSectionChange(section.key, e.target.value)
                  }
                  placeholder={section.placeholder}
                  minRows={3}
                />
              </div>
            ))}

            {error && (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            )}
          </div>
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
            disabled: !brandName.trim() || isSubmitting,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
