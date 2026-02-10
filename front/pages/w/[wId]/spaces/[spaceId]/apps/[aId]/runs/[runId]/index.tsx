import { RunPage } from "@app/components/pages/spaces/apps/RunPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSideProps } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSideProps;

const PageWithAuthLayout = RunPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
