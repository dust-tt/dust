import type { Options } from "@contentful/rich-text-react-renderer";
import { documentToReactComponents } from "@contentful/rich-text-react-renderer";
import type {
  Block,
  Document,
  Inline,
  Text,
} from "@contentful/rich-text-types";
import { BLOCKS, INLINES, MARKS } from "@contentful/rich-text-types";
import Image from "next/image";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { A, H2, H3, H4, H5 } from "@app/components/home/ContentComponents";
import { contentfulImageLoader } from "@app/lib/contentful/imageLoader";
import { isString } from "@app/types";

function getYouTubeVideoId(text: string): string | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([^&\s?]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([^&\s?]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([^&\s?]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/([^&\s?]+)/,
  ];

  for (const pattern of patterns) {
    const match = text.trim().match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function YouTubeEmbed({ videoId }: { videoId: string }) {
  return (
    <div className="my-8 aspect-video w-full overflow-hidden rounded-lg">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title="YouTube video player"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="h-full w-full"
      />
    </div>
  );
}

function isTextNode(node: Block | Inline | Text): node is Text {
  return node.nodeType === "text";
}

function getParagraphText(node: Block | Inline): string {
  let text = "";
  if ("content" in node) {
    for (const child of node.content) {
      if (isTextNode(child)) {
        text += child.value;
      }
    }
  }
  return text;
}

interface ContentfulLightboxImageProps {
  src: string;
  alt: string;
  title?: string | null;
  width: number;
  height: number;
}

function ContentfulLightboxImage({
  src,
  alt,
  title,
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
        {title ? (
          <figcaption className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {title}
          </figcaption>
        ) : null}
      </figure>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm duration-200 animate-in fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
        >
          {/* Close button */}
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
    [MARKS.BOLD]: (text: ReactNode) => (
      <strong className="font-semibold">{text}</strong>
    ),
    [MARKS.ITALIC]: (text: ReactNode) => <em>{text}</em>,
    [MARKS.UNDERLINE]: (text: ReactNode) => <u>{text}</u>,
    [MARKS.CODE]: (text: ReactNode) => {
      // Check if code contains newlines - render as block
      const textContent = isString(text) ? text : "";
      if (textContent.includes("\n")) {
        return (
          <pre className="my-4 overflow-x-auto rounded-lg bg-gray-100 p-4">
            <code className="font-mono text-sm">{text}</code>
          </pre>
        );
      }
      // Inline code
      return (
        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm">
          {text}
        </code>
      );
    },
  },
  renderNode: {
    [BLOCKS.HEADING_1]: (_node, children) => (
      <H2 className="mb-6 mt-10">{children}</H2>
    ),
    [BLOCKS.HEADING_2]: (_node, children) => (
      <H3 className="mb-4 mt-8">{children}</H3>
    ),
    [BLOCKS.HEADING_3]: (_node, children) => (
      <H4 className="mb-3 mt-6">{children}</H4>
    ),
    [BLOCKS.HEADING_4]: (_node, children) => (
      <H5 className="mb-2 mt-5">{children}</H5>
    ),
    [BLOCKS.HEADING_5]: (_node, children) => (
      <h6 className="mb-2 mt-4 text-base font-semibold">{children}</h6>
    ),
    [BLOCKS.HEADING_6]: (_node, children) => (
      <h6 className="mb-2 mt-4 text-sm font-semibold">{children}</h6>
    ),
    [BLOCKS.PARAGRAPH]: (node, children) => {
      // Check if paragraph contains only a YouTube URL
      const text = getParagraphText(node);
      const youtubeId = getYouTubeVideoId(text);
      if (youtubeId && text.trim().match(/^https?:\/\//)) {
        return <YouTubeEmbed videoId={youtubeId} />;
      }

      return (
        <div className="copy-lg mb-4 whitespace-pre-line font-sans text-muted-foreground">
          {children}
        </div>
      );
    },
    [BLOCKS.UL_LIST]: (_node, children) => (
      <ul className="mb-4 ml-6 list-disc space-y-2">{children}</ul>
    ),
    [BLOCKS.OL_LIST]: (_node, children) => (
      <ol className="mb-4 ml-6 list-decimal space-y-2">{children}</ol>
    ),
    [BLOCKS.LIST_ITEM]: (_node, children) => (
      <li className="whitespace-pre-line text-muted-foreground">{children}</li>
    ),
    [BLOCKS.QUOTE]: (_node, children) => (
      <blockquote className="my-6 whitespace-pre-line border-l-4 border-highlight pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    [BLOCKS.HR]: () => <hr className="mb-8 mt-8 border-gray-200" />,
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
          title={title ?? null}
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
