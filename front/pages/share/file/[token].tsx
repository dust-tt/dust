import Head from "next/head";

import { PublicInteractiveContentContainer } from "@app/components/assistant/conversation/content/PublicInteractiveContentContainer";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

interface SharedFilePageProps {
  title: string;
  token: string;
}

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<{
  title: string;
  token: string;
}>(async (context) => {
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
        destination: `/w/${workspace.sId}/assistant/${file.useCaseMetadata?.conversationId}#?icid=${file.sId}`,
        permanent: false,
      },
    };
  }

  // Note: We don't protect workspace sharing here - protection happens at the API level.
  // This allows the page to load but the content API call will fail if unauthorized.

  return {
    props: {
      title: file.fileName,
      token,
    },
  };
});

export default function SharedFilePage({ title, token }: SharedFilePageProps) {
  return (
    <>
      <Head>
        <title>{title} - Dust</title>
        <meta name="description" content="Shared interactive content" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="shortcut icon" href="/static/favicon.png" />
        <link rel="icon" type="image/png" href="/static/favicon.png" />
      </Head>
      <div className="flex h-screen w-full">
        <PublicInteractiveContentContainer shareToken={token} />
      </div>
    </>
  );
}
