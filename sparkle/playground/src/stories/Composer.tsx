import { Button, cn, Page } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import type { ComposerSubmission } from "../components/composer/Composer";
import { Composer } from "../components/composer/Composer";
import { getModelWithReasoningEffortLabel } from "../components/composer/ComposerModelPicker";
import { getRandomGreetingForName } from "../data/greetings";

interface ComposerVariantProps {
  inConversation: boolean;
  onSubmit: (submission: ComposerSubmission) => void;
}

interface ComposerVariant {
  id: string;
  label: string;
  description: string;
  component: ComponentType<ComposerVariantProps>;
}

// One entry per UI option. Add new versions here; the side panel lists them in order.
const VARIANTS: ComposerVariant[] = [
  {
    id: "current",
    label: "A · Current",
    description: "Exact copy of front's composer: “+” opens the / menu.",
    component: Composer,
  },
  {
    id: "searchbar",
    label: "B · Search in menu",
    description:
      "The / menu has a search field at the top; “+” puts the cursor in it.",
    component: (props) => <Composer {...props} slashSearch="searchbar" />,
  },
  {
    id: "compact-nav",
    label: "C · Compact navigation",
    description:
      "B, with Back and the breadcrumb on one line (‹ Attach / …); sub-menus show a title.",
    component: (props) => (
      <Composer {...props} slashSearch="searchbar" slashNav="compact" />
    ),
  },
  {
    id: "search-on-plus",
    label: "D · Search on + only",
    description:
      "C, but only “+” shows the search field; a typed / searches inline after it, like A.",
    component: (props) => (
      <Composer {...props} slashSearch="plus" slashNav="compact" />
    ),
  },
];

const VARIANT_STORAGE_KEY = "composer-playground-variant";

function readStoredVariant(): string {
  try {
    const stored = localStorage.getItem(VARIANT_STORAGE_KEY);
    if (stored && VARIANTS.some((v) => v.id === stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable: fall back to the first variant.
  }
  return VARIANTS[0].id;
}

function OptionButton({
  isActive,
  label,
  description,
  onClick,
}: {
  isActive: boolean;
  label: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors",
        isActive
          ? "border-highlight-300 bg-highlight-50 dark:border-highlight-300-night dark:bg-highlight-50-night"
          : "border-border bg-background hover:bg-muted-background dark:border-border-night dark:bg-background-night dark:hover:bg-muted-background-night"
      )}
    >
      <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
        {label}
      </span>
      {description && (
        <span className="text-xs text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </span>
      )}
    </button>
  );
}

// Home page composer (front ConversationContainer homeHero), with a side panel to switch
// between UI options and between the home / in-conversation contexts.
export default function ComposerStory() {
  const greeting = useMemo(() => getRandomGreetingForName("Radja"), []);
  const [inConversation, setInConversation] = useState(false);
  const [variantId, setVariantId] = useState(readStoredVariant);
  const [submissions, setSubmissions] = useState<ComposerSubmission[]>([]);

  const variant = VARIANTS.find((v) => v.id === variantId) ?? VARIANTS[0];
  const VariantComposer = variant.component;

  const selectVariant = (id: string) => {
    setVariantId(id);
    try {
      localStorage.setItem(VARIANT_STORAGE_KEY, id);
    } catch {
      // Ignore: the choice just won't persist.
    }
  };

  return (
    <div className="flex h-dvh w-full bg-background dark:bg-background-night">
      <aside className="flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border p-4 dark:border-border-night">
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
            Version
          </div>
          {VARIANTS.map((v) => (
            <OptionButton
              key={v.id}
              isActive={v.id === variant.id}
              label={v.label}
              description={v.description}
              onClick={() => selectVariant(v.id)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
            Context
          </div>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant={inConversation ? "outline" : "primary"}
              label="Home"
              onClick={() => setInConversation(false)}
            />
            <Button
              size="xs"
              variant={inConversation ? "primary" : "outline"}
              label="In conversation"
              onClick={() => setInConversation(true)}
            />
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center overflow-y-auto px-4">
        {!inConversation && (
          <div className="flex h-fit w-full max-w-conversation flex-col items-center justify-end gap-4 pb-8 pt-4 md:min-h-[36vh]">
            <Page.Header
              title={
                <h3 className="heading-3xl font-medium text-foreground dark:text-foreground-night">
                  {greeting}
                </h3>
              }
            />
          </div>
        )}

        {inConversation && <div className="flex-1" />}

        <div className="flex w-full pb-2 md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1 md:pb-4">
          <VariantComposer
            key={`${variant.id}-${inConversation ? "conversation" : "home"}`}
            inConversation={inConversation}
            onSubmit={(s) => setSubmissions((prev) => [s, ...prev].slice(0, 5))}
          />
        </div>

        {submissions.length > 0 && (
          <div className="flex w-full max-w-conversation flex-col gap-2 pb-10 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Submitted
            </div>
            {submissions.map((s, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-muted-background p-3 text-sm dark:border-border-night dark:bg-muted-background-night"
              >
                <div className="whitespace-pre-wrap text-foreground dark:text-foreground-night">
                  {s.text || (
                    <span className="italic text-muted-foreground">
                      (no text)
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Agent: {s.agent ? `@${s.agent.name}` : "none"}</span>
                  <span>
                    Model: {getModelWithReasoningEffortLabel(s.model)}
                  </span>
                  {s.files.length > 0 && (
                    <span>Files: {s.files.join(", ")}</span>
                  )}
                  {s.spaceIds.length > 0 && (
                    <span>Spaces: {s.spaceIds.length}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
