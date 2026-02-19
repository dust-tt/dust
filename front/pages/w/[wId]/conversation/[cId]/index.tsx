import { ConversationPage } from "@app/components/pages/conversation/ConversationPage";
import { conversationGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = ConversationPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = conversationGetLayout;

export default PageWithAuthLayout;
