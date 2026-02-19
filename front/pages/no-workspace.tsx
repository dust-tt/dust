import { NoWorkspacePage } from "@app/components/pages/onboarding/NoWorkspacePage";
import { appGetServerSidePropsForUserNoWorkspace } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsForUserNoWorkspace;

export default NoWorkspacePage;
