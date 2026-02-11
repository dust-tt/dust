import { SsoEnforcedPage } from "@app/components/pages/SsoEnforcedPage";
import { appGetServerSidePropsForUserNoWorkspace } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForUserNoWorkspace;

export default SsoEnforcedPage;
