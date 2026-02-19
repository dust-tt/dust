import { TranscriptsPage } from "@app/components/pages/workspace/labs/TranscriptsPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

// biome-ignore lint/plugin/nextjsNoDataFetchingInGetssp: pre-existing
export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = TranscriptsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
