import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<object>(
  async (context, auth) => {
    if (!auth.workspace() || !auth.user()) {
      return {
        notFound: true,
      };
    }

    return {
      redirect: {
        destination: `/w/${context.query.wId}/assistant/new`,
        permanent: false,
      },
    };
  }
);

export default function Redirect() {
  return <></>;
}
