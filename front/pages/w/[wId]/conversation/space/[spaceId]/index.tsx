import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { wId, spaceId } = context.params ?? {};

  if (typeof wId !== "string" || typeof spaceId !== "string") {
    return {
      notFound: true,
    };
  }

  return {
    redirect: {
      destination: `/w/${wId}/conversation/space/${spaceId}/conversations`,
      permanent: false,
    },
  };
};

export default function SpaceIndex() {
  return null;
}
