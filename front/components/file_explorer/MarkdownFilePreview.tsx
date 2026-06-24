import { LinkBlock, Markdown } from "@dust-tt/sparkle";
import type React from "react";
import { useMemo, useRef } from "react";
import type { Components } from "react-markdown";
import type { PluggableList } from "react-markdown/lib/react-markdown";
import { visit } from "unist-util-visit";

interface MarkdownFilePreviewProps {
  content: string;
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

export function MarkdownFilePreview({ content }: MarkdownFilePreviewProps) {
  const previewRef = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={previewRef}
      className="rounded-lg bg-muted-background p-4 dark:bg-muted-background-night"
    >
      <Markdown
        content={content}
        isStreaming={false}
        additionalMarkdownComponents={markdownComponents}
        additionalMarkdownPlugins={markdownPlugins}
      />
    </div>
  );
}
