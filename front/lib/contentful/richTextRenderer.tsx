import type { Options } from "@contentful/rich-text-react-renderer";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import type { Block, Document, Inline } from "@contentful/rich-text-types";
import { BLOCKS, INLINES, MARKS } from "@contentful/rich-text-types";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { A, H2, H3, H4, H5 } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import {
  isBlockOrInline,
  isTextNode,
} from "@app/lib/contentful/tableOfContents";
import { isString } from "@app/types";
import { slugify } from "@app/types/shared/utils/string_utils";

function getYouTubeVideoId(text: string): string | null {
  const normalizedText = text.trim();
  const patterns: RegExp[] = [
    /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:.*&)?v=([^&\s]+)/,
    /^(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^?\s]+)/,
    /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/embed\/([^?\s]+)/,
    /^(?:https?:\/\/)?(?:www\.)?youtube-nocookie\.com\/embed\/([^?\s]+)/,
    /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([^?\s/]+)/,
    /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/live\/([^?\s/]+)/,
    /^(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/v\/([^?\s/]+)/,
  ];

  for (const pattern of patterns) {
    const match = normalizedText.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="my-8 overflow-hidden rounded-lg">
      <div className="relative aspect-video w-full">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

function getParagraphText(node: Block | Inline): string {
  let text = "";
  if ("content" in node) {
    for (const child of node.content) {
      if (isTextNode(child)) {
        text += child.value;
      } else if (isBlockOrInline(child)) {
        text += getParagraphText(child);
      }
    }
  }
  return text;
}

function extractTextFromChildren(children: ReactNode): string {
  if (isString(children)) {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(extractTextFromChildren).join("");
  }
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren(children.props.children);
  }
  return "";
}

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
type HeadingComponent = typeof H2 | typeof H3 | typeof H4 | typeof H5;

function createHeadingRenderer(
  Component: HeadingComponent | HeadingTag,
  className: string
) {
  return (_node: Block | Inline, children: ReactNode) => {
    const text = extractTextFromChildren(children);
    const id = slugify(text);
    const Tag = Component;
    return (
      <Tag id={id} className={className}>
        {children}
      </Tag>
    );
  };
}

interface ContentfulLightboxImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
}

function ContentfulLightboxImage({
  src,
  alt,
  width,
  height,
}: ContentfulLightboxImageProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <figure className="my-8">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="block w-full max-w-3xl cursor-zoom-in"
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            loader={contentfulImageLoader}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
            className="h-auto w-full rounded-lg"
            loading="lazy"
          />
        </button>
      </figure>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm duration-200 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Close lightbox"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            src={`${src}?w=1920&fm=webp&q=85`}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] cursor-zoom-out object-contain duration-200 animate-in zoom-in-95"
            onClick={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}

// Use our styling for the rich text renderer.
const renderOptions: Options = {
  renderMark: {
    [MARKS.BOLD]: (text) => <strong className="font-semibold">{text}</strong>,
    [MARKS.ITALIC]: (text) => <em>{text}</em>,
    [MARKS.CODE]: (text) => (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm">
        {text}
      </code>
    ),
  },
  renderNode: {
    [BLOCKS.HEADING_1]: createHeadingRenderer(
      H2,
      "mb-6 mt-10 scroll-mt-20 text-foreground"
    ),
    [BLOCKS.HEADING_2]: createHeadingRenderer(
      H3,
      "mb-4 mt-8 scroll-mt-20 text-foreground"
    ),
    [BLOCKS.HEADING_3]: createHeadingRenderer(
      H4,
      "mb-3 mt-6 scroll-mt-20 text-foreground"
    ),
    [BLOCKS.HEADING_4]: createHeadingRenderer(
      H5,
      "mb-2 mt-5 scroll-mt-20 text-foreground"
    ),
    [BLOCKS.HEADING_5]: createHeadingRenderer(
      "h6",
      "mb-2 mt-4 scroll-mt-20 text-base font-semibold text-foreground"
    ),
    [BLOCKS.HEADING_6]: createHeadingRenderer(
      "h6",
      "mb-2 mt-4 scroll-mt-20 text-sm font-semibold text-foreground"
    ),
    [BLOCKS.PARAGRAPH]: (node, children) => {
      // Check if paragraph contains only a YouTube URL
      const text = getParagraphText(node);
      const youtubeId = getYouTubeVideoId(text);
      if (youtubeId) {
        return <YouTubeEmbed videoId={youtubeId} />;
      }

      return (
        <div className="copy-lg mb-4 whitespace-pre-line font-sans text-foreground">
          {children}
        </div>
      );
    },
    [BLOCKS.UL_LIST]: (_node, children) => (
      <ul className="mb-4 list-disc space-y-2 pl-6">{children}</ul>
    ),
    [BLOCKS.OL_LIST]: (_node, children) => (
      <ol className="mb-4 list-decimal space-y-2 pl-6">{children}</ol>
    ),
    [BLOCKS.LIST_ITEM]: (_node, children) => (
      <li className="pl-1">{children}</li>
    ),
    [BLOCKS.QUOTE]: (_node, children) => (
      <blockquote className="my-6 border-l-4 border-highlight pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    [BLOCKS.EMBEDDED_ASSET]: (node) => {
      const { file, title, description } = node.data.target.fields;
      if (!file) {
        return null;
      }

      const { url, details } = file;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      const { width, height } = details?.image || { width: 800, height: 400 };
      const alt = title ?? description ?? "Image";

      return (
        <ContentfulLightboxImage
          src={`https:${url}`}
          alt={alt}
          width={width}
          height={height}
        />
      );
    },
    [INLINES.HYPERLINK]: (node, children) => {
      const url = node.data.uri;
      // Check if it's a YouTube URL and embed it
      const youtubeId = getYouTubeVideoId(url);
      if (youtubeId) {
        return <YouTubeEmbed videoId={youtubeId} />;
      }
      const isExternal = url.startsWith("http");
      return (
        <A
          href={url}
          variant="primary"
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
        >
          {children}
        </A>
      );
    },
    [INLINES.ENTRY_HYPERLINK]: (node, children) => {
      const entry = node.data.target;
      if (entry?.sys?.contentType?.sys?.id === "blogPage") {
        const slug = entry.fields.title
          ?.toString()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        return (
          <A href={`/blog/${slug}`} variant="primary">
            {children}
          </A>
        );
      }
      return <span>{children}</span>;
    },
  },
};

export function renderRichTextFromContentful(document: Document): ReactNode {
  if (!document) {
    return null;
  }
  return documentToReactComponents(document, renderOptions);
}
