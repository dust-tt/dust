import { SharedFilePage } from "@app/components/pages/share/SharedFilePage";
import { appGetServerSidePropsPublic } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsPublic;

// This page does a client-side redirect to /share/frame/:token
export default SharedFilePage;
