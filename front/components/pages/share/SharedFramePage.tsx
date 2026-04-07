import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer";
import { EmailVerificationFlow } from "@app/components/pages/share/EmailVerificationFlow";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import { formatFilenameForDisplay } from "@app/lib/files";
import { usePathParam } from "@app/lib/platform";
import { usePublicFrame } from "@app/lib/swr/frames";
import { useShareFrameMetadata } from "@app/lib/swr/share";
import { getFaviconPath } from "@app/lib/utils";
import Custom404 from "@app/pages/404";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

// Origins from which the share frame is considered as embedded.
// We hide the header for embedded origins.
const EMBEDDED_ORIGINS = ["https://dust.tt/blog/"];

export function SharedFramePage() {
  const token = usePathParam("token");

  const [isVerified, setIsVerified] = useState(false);

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

  // Only fetch the frame once metadata has resolved. Metadata handles the region redirect, so we
  // need to wait for the correct region to be established before firing this request.
  const { error: frameError, mutateFrame } = usePublicFrame({
    shareToken: shareMetadata ? token : null,
  });

  // Show the email form when:
  // 1. Metadata says the scope requires email verification, AND
  // 2. The frame endpoint returned an error (user is not yet authorized), AND
  // 3. The user hasn't just completed verification in this session.
  const needsEmailVerification =
    !isVerified && !!shareMetadata?.requiresEmailVerification && !!frameError;

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

  const handleVerified = () => {
    setIsVerified(true);
    // Refetch the frame now that the cookie is set.
    void mutateFrame();
  };

  if (isShareMetadataLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!token || shareMetadataError || !shareMetadata) {
    return <Custom404 />;
  }

  // Show email verification form when scope requires it and user isn't authorized yet.
  if (needsEmailVerification) {
    return (
      <EmailVerificationFlow shareToken={token} onVerified={handleVerified} />
    );
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
