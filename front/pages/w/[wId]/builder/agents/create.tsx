import { CreateAgentPage } from "@app/components/pages/builder/agents/CreateAgentPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = CreateAgentPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
