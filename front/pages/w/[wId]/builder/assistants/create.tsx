import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<
  Record<string, never>
>(async (context) => {
  const { wId } = context.params as { wId: string };
  const queryString = context.resolvedUrl.split("?")[1] || "";
  const destination = `/w/${wId}/builder/agents/create${queryString ? `?${queryString}` : ""}`;

  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
});

export default function AssistantsCreateRedirect() {
  return null;
}
