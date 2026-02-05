import { SharedFramePage } from "@app/components/pages/share/SharedFramePage";
import { appGetServerSidePropsPublic } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsPublic;

export default SharedFramePage;
