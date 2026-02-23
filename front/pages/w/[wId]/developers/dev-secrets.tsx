import { SecretsPage } from "@app/components/pages/workspace/developers/SecretsPage";
import { adminGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForBuilders } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSidePropsForBuilders;

const PageWithAuthLayout = SecretsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = adminGetLayout;

export default PageWithAuthLayout;
