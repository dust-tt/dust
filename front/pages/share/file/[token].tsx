import Head from "next/head";

import { PublicContentCreationContainer } from "@app/components/assistant/conversation/content_creation/PublicContentCreationContainer";
import config from "@app/lib/api/config";
import { formatFilenameForDisplay } from "@app/lib/files";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getFaviconPath } from "@app/lib/utils";

interface SharedFilePageProps {
  shareUrl: string;
  title: string;
  token: string;
  workspaceName: string;
  workspaceId: string;
}

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<SharedFilePageProps>(async (context) => {
  if (!context.params) {
    return {
      notFound: true,
    };
  }

  const { token } = context.params;
  if (!token || typeof token !== "string") {
    return {
      notFound: true,
    };
  }

  // Fetch the file by token to determine scope.
  const result = await FileResource.fetchByShareTokenWithContent(token);
  if (!result) {
    return {
      notFound: true,
    };
  }

  const { file } = result;
  const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
  if (!workspace) {
    return {
      notFound: true,
    };
  }

  // Note: We don't protect workspace sharing here - protection happens at the API level.
  // This allows the page to load but the content API call will fail if unauthorized.

  const shareUrl = `${config.getClientFacingUrl()}${context.req.url}`;

  return {
    props: {
      shareUrl,
      title: file.fileName,
      token,
      workspaceName: workspace.name,
      workspaceId: workspace.sId,
    },
  };
});

export default function SharedFilePage({
  shareUrl,
  title,
  token,
  workspaceName,
  workspaceId,
}: SharedFilePageProps) {
  const humanFriendlyTitle = formatFilenameForDisplay(title);
  const faviconPath = getFaviconPath();
  const description = `Discover what ${workspaceName} built with AI. Explore now.`;

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
          content={`${humanFriendlyTitle} - ${workspaceName}`}
        />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:site_name" content="Dust" />
        <meta property="og:image" content="https://dust.tt/static/og/ic.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta
          property="og:image:alt"
          content={`Preview of ${humanFriendlyTitle} created by ${workspaceName}`}
        />

        {/* Favicon */}
        <link rel="icon" type="image/png" href={faviconPath} />
      </Head>
      <div className="h-dvh flex w-full">
        <PublicContentCreationContainer
          shareToken={token}
          workspaceId={workspaceId}
        />
      </div>
    </>
  );
}
