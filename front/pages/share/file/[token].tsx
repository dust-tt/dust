import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";
import { FileResource } from "@app/lib/resources/file_resource";
import { frameContentType } from "@app/types/files";

export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})(async (context) => {
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

  // Fetch the file by token to check the type.
  const result = await FileResource.fetchByShareTokenWithContent(token);
  if (!result) {
    return {
      notFound: true,
    };
  }

  const { file } = result;
  if (file.contentType === frameContentType) {
    // Redirect to the new frame route.
    return {
      redirect: {
        destination: `/share/frame/${token}`,
        permanent: true,
      },
    };
  }

  return {
    notFound: true,
  };
});

export default function SharedFilePage() {
  // This page should never be rendered because of the redirect in getServerSideProps.
  return null;
}
