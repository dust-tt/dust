import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withDefaultUserAuthRequirements<
  Record<string, never>
>(async (context) => {
  const { wId } = context.params as { wId: string };

  return {
    redirect: {
      destination: `/w/${wId}/builder/agents`,
      permanent: true,
    },
  };
});

export default function AssistantsRedirect() {
  return null;
}
