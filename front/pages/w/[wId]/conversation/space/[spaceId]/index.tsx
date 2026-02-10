import { SpaceConversationsPage } from "@app/components/pages/conversation/SpaceConversationsPage";
import { conversationGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = SpaceConversationsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = conversationGetLayout;

export default PageWithAuthLayout;
