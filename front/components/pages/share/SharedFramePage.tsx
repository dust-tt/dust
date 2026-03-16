import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePathParam } from "@app/lib/platform";
import { useShareFrameMetadata } from "@app/lib/swr/share";
import { getFaviconPath } from "@app/lib/utils";
import Custom404 from "@app/pages/404";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

// Origins from which the share frame is considered as embedded.
// We hide the header for embedded origins.
const EMBEDDED_ORIGINS = ["https://dust.tt/blog/"];

export function SharedFramePage() {
  const token = usePathParam("token");

  const hideHeader = useMemo(() => {
    if (typeof window === "undefined" || !document.referrer) {
      return false;
    }
    return EMBEDDED_ORIGINS.some((origin) =>
      document.referrer.toLowerCase().startsWith(origin)
    );
  }, []);

  const { shareMetadata, isShareMetadataLoading, shareMetadataError } =
    useShareFrameMetadata({
      shareToken: token,
    });

  const humanFriendlyTitle = shareMetadata
    ? formatFilenameForDisplay(shareMetadata.title)
    : "";

  useDocumentTitle(
    humanFriendlyTitle ? `${humanFriendlyTitle} - Powered by Dust` : "Dust"
  );

  // Set favicon and meta tags for sharing/SEO.
  useEffect(() => {
    if (!shareMetadata) {
      return;
    }

    const description = `Discover what ${shareMetadata.workspaceName} built with AI. Explore now.`;
    const faviconPath = getFaviconPath();
    const elements: HTMLElement[] = [];

    const addMeta = (attrs: Record<string, string>) => {
      const el = document.createElement("meta");
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      document.head.appendChild(el);
      elements.push(el);
    };

    const addLink = (attrs: Record<string, string>) => {
      const el = document.createElement("link");
      for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
      }
      document.head.appendChild(el);
      elements.push(el);
    };

    addMeta({ name: "description", content: description });

    // Prevent search engine indexing.
    const robotsContent =
      "noindex, nofollow, noarchive, nosnippet, noimageindex";
    addMeta({ name: "robots", content: robotsContent });
    addMeta({ name: "googlebot", content: robotsContent });
    addMeta({ name: "bingbot", content: robotsContent });

    // Open Graph meta tags.
    addMeta({ property: "og:type", content: "website" });
    addMeta({
      property: "og:title",
      content: `${humanFriendlyTitle} - ${shareMetadata.workspaceName}`,
    });
    addMeta({ property: "og:description", content: description });
    addMeta({ property: "og:image:height", content: "630" });
    addMeta({ property: "og:image:width", content: "1200" });
    addMeta({
      property: "og:image",
      content: "https://dust.tt/static/og/ic.png",
    });
    addMeta({ property: "og:site_name", content: "Dust" });
    addMeta({ property: "og:url", content: shareMetadata.shareUrl });
    addMeta({
      property: "og:image:alt",
      content: `Preview of ${humanFriendlyTitle} created by ${shareMetadata.workspaceName}`,
    });

    addLink({ rel: "icon", type: "image/png", href: faviconPath });

    return () => {
      for (const el of elements) {
        el.remove();
      }
    };
  }, [shareMetadata, humanFriendlyTitle]);

  if (!token) {
    return <Custom404 />;
  }

  if (isShareMetadataLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (shareMetadataError || !shareMetadata) {
    return <Custom404 />;
  }

  return (
    <div className="flex h-dvh w-full">
      <PublicInteractiveContentContainer
        shareToken={token}
        workspaceId={shareMetadata.workspaceId}
        vizUrl={shareMetadata.vizUrl}
        hideHeader={hideHeader}
      />
    </div>
  );
}
