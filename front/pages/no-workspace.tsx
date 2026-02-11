import { NoWorkspacePage } from "@app/components/pages/onboarding/NoWorkspacePage";
import { appGetServerSidePropsForUserNoWorkspace } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForUserNoWorkspace;

export default NoWorkspacePage;
