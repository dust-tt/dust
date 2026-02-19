import { SsoEnforcedPage } from "@app/components/pages/SsoEnforcedPage";
import { appGetServerSidePropsForUserNoWorkspace } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsForUserNoWorkspace;

export default SsoEnforcedPage;
