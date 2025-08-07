import Head from "next/head";

import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/content/PublicInteractiveContentContainer";
import config from "@app/lib/api/config";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  INTERACTIVE_CONTENT_SIDE_PANEL_TYPE,
  SIDE_PANEL_TYPE_HASH_PARAM,
} from "@app/types/conversation_side_panel";

interface SharedFilePageProps {
  shareUrl: string;
  title: string;
  token: string;
  workspaceName: string;
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

  const { file, shareScope } = result;
  const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
  if (!workspace) {
    return {
      notFound: true,
    };
  }

  // If the file is shared with conversation participants, redirect to the conversation.
  if (shareScope === "conversation_participants") {
    return {
      redirect: {
        destination: `/w/${workspace.sId}/assistant/${file.useCaseMetadata?.conversationId}#?${SIDE_PANEL_TYPE_HASH_PARAM}=${INTERACTIVE_CONTENT_SIDE_PANEL_TYPE}&spid=${file.sId}`,
        permanent: false,
      },
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
    },
  };
});

export default function SharedFilePage({
  shareUrl,
  title,
  token,
  workspaceName,
}: SharedFilePageProps) {
  const description = `Interactive content "${title}" shared from ${workspaceName} workspace`;

  return (
    <>
      <Head>
        {/* Basic meta tags */}
        <title>{title} - Dust</title>
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
        <meta property="og:title" content={`${title} - Interactive Content`} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={shareUrl} />
        <meta property="og:site_name" content="Dust" />
        <meta property="og:image" content="https://dust.tt/static/og/ic.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Dust - Interactive Content" />

        {/* Favicon */}
        <link rel="shortcut icon" href="/static/favicon.png" />
        <link rel="icon" type="image/png" href="/static/favicon.png" />
      </Head>
      <div className="flex h-screen w-full">
        <PublicInteractiveContentContainer shareToken={token} />
      </div>
    </>
  );
}
