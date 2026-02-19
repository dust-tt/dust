import { SharedFramePage } from "@app/components/pages/share/SharedFramePage";
import { appGetServerSidePropsPublic } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsPublic;

export default SharedFramePage;
