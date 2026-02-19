import { JoinPage } from "@app/components/pages/onboarding/JoinPage";
import { makeGetServerSidePropsRequirementsWrapper } from "@app/lib/iam/session";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = makeGetServerSidePropsRequirementsWrapper({
  requireUserPrivilege: "none",
})<Record<string, never>>(async () => {
  return { props: {} };
});

export default JoinPage;
