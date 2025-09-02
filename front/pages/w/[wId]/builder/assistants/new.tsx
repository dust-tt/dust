import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<
  Record<string, never>
>(async (context, auth) => {
  const { wId } = context.params as { wId: string };
  const queryString = context.resolvedUrl.split("?")[1] || "";
  const destination = `/w/${wId}/builder/agents/new${queryString ? `?${queryString}` : ""}`;

  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
});

export default function AssistantsNewRedirect() {
  return null;
}
