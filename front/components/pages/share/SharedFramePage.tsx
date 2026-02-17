import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/interactive_content/PublicInteractiveContentContainer";
import { formatFilenameForDisplay } from "@app/lib/files";
import { Head, usePathParam } from "@app/lib/platform";
import { useShareFrameMetadata } from "@app/lib/swr/share";
import { getFaviconPath } from "@app/lib/utils";
import Custom404 from "@app/pages/404";
import { Spinner } from "@dust-tt/sparkle";
import { useEffect } from "react";

export function SharedFramePage() {
  const token = usePathParam("token");

  const { shareMetadata, isShareMetadataLoading, shareMetadataError } =
    useShareFrameMetadata({
      shareToken: token,
    });

  // Update document title when metadata loads
  useEffect(() => {
    if (shareMetadata?.title) {
      const humanFriendlyTitle = formatFilenameForDisplay(shareMetadata.title);
      document.title = `${humanFriendlyTitle} - Powered by Dust`;
    }
  }, [shareMetadata?.title]);

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

  const humanFriendlyTitle = formatFilenameForDisplay(shareMetadata.title);
  const description = `Discover what ${shareMetadata.workspaceName} built with AI. Explore now.`;
  const faviconPath = getFaviconPath();

  return (
    <>
      <Head>
        {/* Basic meta tags */}
        <title>{humanFriendlyTitle} - Powered by Dust</title>
        <meta name="description" content={description} />

        {/* Prevent search engine indexing */}
        <meta
          name="robots"
          content="noindex, nofollow, noarchive, nosnippet, noimageindex"
        />
        <meta
          name="googlebot"
          content="noindex, nofollow, noarchive, nosnippet, noimageindex"
        />
        <meta
          name="bingbot"
          content="noindex, nofollow, noarchive, nosnippet, noimageindex"
        />

        {/* Open Graph meta tags */}
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content={`${humanFriendlyTitle} - ${shareMetadata.workspaceName}`}
        />
        <meta property="og:description" content={description} />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image" content="https://dust.tt/static/og/ic.png" />
        <meta property="og:site_name" content="Dust" />
        <meta property="og:url" content={shareMetadata.shareUrl} />
        <meta
          property="og:image:alt"
          content={`Preview of ${humanFriendlyTitle} created by ${shareMetadata.workspaceName}`}
        />

        {/* Favicon */}
        <link rel="icon" type="image/png" href={faviconPath} />
      </Head>
      <div className="flex h-dvh w-full">
        <PublicInteractiveContentContainer
          shareToken={token}
          workspaceId={shareMetadata.workspaceId}
        />
      </div>
    </>
  );
}
