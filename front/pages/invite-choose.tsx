import { InviteChoosePage } from "@app/components/pages/onboarding/InviteChoosePage";
import { appGetServerSidePropsForUserNoWorkspace } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForUserNoWorkspace;

export default InviteChoosePage;
