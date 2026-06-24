import { RawMarkdownEditor } from "@app/components/editor/RawMarkdownEditor";
import {
  ButtonsSwitch,
  ButtonsSwitchList,
  cn,
  Edit04,
  Eye,
  LinkBlock,
  Markdown,
} from "@dust-tt/sparkle";
import type React from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { visit } from "unist-util-visit";

export type MarkdownFilePreviewViewMode = "preview" | "edit";

interface MarkdownFilePreviewProps {
  content: string;
  canEdit?: boolean;
  showToolbar?: boolean;
  viewMode: MarkdownFilePreviewViewMode;
  onContentChange?: (content: string) => void;
  onViewModeChange?: (mode: MarkdownFilePreviewViewMode) => void;
}

interface MarkdownFilePreviewViewModeSwitchProps {
  viewMode: MarkdownFilePreviewViewMode;
  onViewModeChange: (mode: MarkdownFilePreviewViewMode) => void;
}

export function MarkdownFilePreviewViewModeSwitch({
  viewMode,
  onViewModeChange,
}: MarkdownFilePreviewViewModeSwitchProps) {
  return (
    <ButtonsSwitchList
      key={viewMode}
      defaultValue={viewMode}
      size="xs"
      onValueChange={(value) => {
        if (isViewMode(value)) {
          onViewModeChange(value);
        }
      }}
    >
      <ButtonsSwitch value="preview" label="Preview" icon={Eye} />
      <ButtonsSwitch value="edit" label="Edit" icon={Edit04} />
    </ButtonsSwitchList>
  );
}

function isViewMode(value: string): value is MarkdownFilePreviewViewMode {
  return value === "preview" || value === "edit";
}

interface LinkProps {
  children: React.ReactNode;
  href?: string;
}

interface MarkdownNode {
  children?: MarkdownNode[];
  data?: {
    hProperties?: Record<string, string>;
  };
  value?: unknown;
}

function getMarkdownNodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }

  return node.children?.map(getMarkdownNodeText).join("") ?? "";
}

function getSlugBase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function getMarkdownHeadingAnchorPlugin() {
  const slugCounts = new Map<string, number>();
  return (tree: any) => {
    visit(tree, "heading", (node: MarkdownNode) => {
      const baseSlug = getSlugBase(getMarkdownNodeText(node));

      if (!baseSlug) {
        return;
      }

      const count = slugCounts.get(baseSlug) ?? 0;
      slugCounts.set(baseSlug, count + 1);
      const id = count === 0 ? baseSlug : `${baseSlug}-${count}`;

      const data = node.data ?? (node.data = {});
      data.hProperties = {
        ...data.hProperties,
        id,
      };
    });
  };
}

function getElementByIdWithin(
  root: HTMLElement,
  id: string
): HTMLElement | null {
  for (const element of root.querySelectorAll<HTMLElement>("[id]")) {
    if (element.id === id) {
      return element;
    }
  }

  return null;
}

function getLocalAnchorId(href: string): string | null {
  const getDecodedHash = (hash: string) => {
    const rawHash = hash.startsWith("#") ? hash.slice(1) : hash;

    try {
      return decodeURIComponent(rawHash);
    } catch {
      return rawHash;
    }
  };

  if (href.startsWith("#")) {
    return getDecodedHash(href);
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(href, window.location.href);
    const currentUrl = new URL(window.location.href);

    if (
      url.origin === currentUrl.origin &&
      url.pathname === currentUrl.pathname &&
      url.search === currentUrl.search &&
      url.hash
    ) {
      return getDecodedHash(url.hash);
    }
  } catch {
    return null;
  }

  return null;
}

function isPreviewInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.closest(
      "a, button, input, textarea, select, [role='link'], [role='button']"
    ) !== null
  );
}

export function MarkdownFilePreview({
  content,
  canEdit = false,
  showToolbar = true,
  viewMode,
  onContentChange,
  onViewModeChange,
}: MarkdownFilePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const previewContentRef = useRef(content);

  if (viewMode === "preview") {
    previewContentRef.current = content;
  }

  useLayoutEffect(() => {
    if (viewMode === "edit") {
      editTextareaRef.current?.focus({ preventScroll: true });
    }
  }, [viewMode]);

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (
      !canEdit ||
      !onViewModeChange ||
      viewMode !== "preview" ||
      isPreviewInteractiveTarget(event.target)
    ) {
      return;
    }

    onViewModeChange("edit");
  };

  const markdownPlugins = useMemo<PluggableList>(
    () => [() => getMarkdownHeadingAnchorPlugin()],
    []
  );

  const markdownComponents = useMemo<Components>(
    () => ({
      a: ({ children, href }: LinkProps) => {
        const anchorId = href ? getLocalAnchorId(href) : null;
        const onClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
          if (!anchorId || !previewRef.current) {
            return;
          }

          event.preventDefault();
          getElementByIdWithin(previewRef.current, anchorId)?.scrollIntoView({
            block: "start",
          });
        };

        return (
          <LinkBlock
            href={href}
            target={anchorId ? "_self" : undefined}
            onClick={onClick}
          >
            {children}
          </LinkBlock>
        );
      },
    }),
    []
  );

  const markdownContent = canEdit ? previewContentRef.current : content;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      {canEdit && showToolbar && onViewModeChange && (
        <div className="flex shrink-0 justify-end">
          <MarkdownFilePreviewViewModeSwitch
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-muted-background dark:bg-muted-background-night">
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col p-4",
            viewMode !== "preview" && "hidden"
          )}
        >
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
              canEdit && "cursor-text"
            )}
            onClick={handlePreviewClick}
          >
            <div ref={previewRef}>
              <Markdown
                content={markdownContent}
                isStreaming={false}
                optimizeForStreaming={false}
                additionalMarkdownComponents={markdownComponents}
                additionalMarkdownPlugins={markdownPlugins}
              />
            </div>
          </div>
        </div>
        {canEdit ? (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col p-4",
              viewMode !== "edit" && "hidden"
            )}
          >
            <RawMarkdownEditor
              ref={editTextareaRef}
              value={content}
              onChange={onContentChange}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
