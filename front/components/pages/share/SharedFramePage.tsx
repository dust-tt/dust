import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer";
import Custom404 from "@app/components/pages/Custom404";
import CustomErrorPage from "@app/components/pages/CustomErrorPage";
import { EmailVerificationFlow } from "@app/components/pages/share/EmailVerificationFlow";
import { useDocumentTitle } from "@app/hooks/useDocumentTitle";
import config from "@app/lib/api/config";
import { DUST_HAS_SESSION, hasSessionIndicator } from "@app/lib/cookies";
import { usePathParam } from "@app/lib/platform";
import { usePublicFrame } from "@app/lib/swr/frames";
import { useShareFrameMetadata } from "@app/lib/swr/share";
import { useUser } from "@app/lib/swr/user";
import { getFaviconPath } from "@app/lib/utils";
import { LogIn01, Spinner } from "@dust-tt/sparkle";
import { usePostHog } from "posthog-js/react";
import { useEffect, useMemo, useState } from "react";
import { useCookies } from "react-cookie";

// Origins from which the share frame is considered as embedded.
// We hide the header for embedded origins.
const EMBEDDED_ORIGINS = ["https://dust.tt/blog/"];

export function SharedFramePage() {
  const token = usePathParam("token");
  const posthog = usePostHog();

  const [isVerified, setIsVerified] = useState(false);
  const [cookies] = useCookies([DUST_HAS_SESSION]);
  const hasSession = hasSessionIndicator(cookies[DUST_HAS_SESSION]);
  const {
    user,
    isUserLoading,
    isUserError: userError,
  } = useUser({
    disabled: !hasSession,
    redirectOnUnauthenticated: false,
  });

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
  const {
    frameMetadata,
    error: frameError,
    mutateFrame,
  } = usePublicFrame({
    shareToken: shareMetadata ? token : null,
  });

  // Track frame view once the frame successfully loads.
  useEffect(() => {
    if (!frameMetadata || !shareMetadata) {
      return;
    }
    posthog.capture("frame_shared_view", {
      workspace_id: shareMetadata.workspaceId,
      requires_email_verification: shareMetadata.requiresEmailVerification,
    });
  }, [frameMetadata, shareMetadata, posthog]);

  // Show the email form when:
  // 1. Metadata says the scope requires email verification, AND
  // 2. The frame endpoint returned an error (user is not yet authorized), AND
  // 3. The user hasn't just completed verification in this session.
  const needsEmailVerification =
    !isVerified && !!shareMetadata?.requiresEmailVerification && !!frameError;

  const humanFriendlyTitle = shareMetadata?.title ?? "";

  useDocumentTitle(
    humanFriendlyTitle ? `${humanFriendlyTitle} - Powered by Dust` : "Dust"
  );

  // Set favicon and meta tags for sharing/SEO.
  useEffect(() => {
    if (!shareMetadata) {
      return;
    }

    const description = `Discover what ${shareMetadata.workspaceName} built with AI. Explore now.`;
    const faviconPath = shareMetadata.faviconUrl ?? getFaviconPath();
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
      content: shareMetadata.ogImageUrl ?? "https://dust.tt/static/og/ic.png",
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
        <Spinner size="lg" />
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

  if (frameError) {
    if (hasSession && isUserLoading && !userError) {
      return (
        <div className="flex h-dvh w-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      );
    }

    if (!hasSession || userError || !user) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const loginUrl = `${config.getApiBaseUrl()}/api/workos/login?returnTo=${encodeURIComponent(returnTo)}`;

      return (
        <CustomErrorPage
          title="Sign in to open this Frame"
          description="Sign in with an account that has access. We’ll bring you back here."
          href={loginUrl}
          label="Sign in"
          icon={LogIn01}
        />
      );
    }

    // Keep the existing non-enumerating response for authenticated users who
    // do not have access (or whose link no longer resolves).
    return <Custom404 />;
  }

  return (
    <div className="flex h-dvh w-full">
      <PublicInteractiveContentContainer
        shareToken={token}
        title={shareMetadata.title}
        workspaceId={shareMetadata.workspaceId}
        vizUrl={shareMetadata.vizUrl}
        logoUrl={shareMetadata.logoUrl}
        showSignUpCta={shareMetadata.showSignUpCta}
        hideHeader={hideHeader}
      />
    </div>
  );
}
