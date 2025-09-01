import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<{}>(
  async (context, auth) => {
    const { wId } = context.params as { wId: string };
    const queryString = context.resolvedUrl.split("?")[1] || "";
    const destination = `/w/${wId}/builder/agents/dust${queryString ? `?${queryString}` : ""}`;

    return {
      redirect: {
        destination,
        permanent: true,
      },
    };
  }
);

export default function AssistantsDustRedirect() {
  return null;
}
