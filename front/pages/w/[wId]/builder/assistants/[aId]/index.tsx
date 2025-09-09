import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<
  Record<string, never>
>(async (context) => {
  const { wId, aId } = context.params as { wId: string; aId: string };
  const queryString = context.resolvedUrl.split("?")[1] || "";
  const destination = `/w/${wId}/builder/agents/${aId}${queryString ? `?${queryString}` : ""}`;

  return {
    redirect: {
      destination,
      permanent: true,
    },
  };
});

export default function AssistantsAgentRedirect() {
  return null;
}
