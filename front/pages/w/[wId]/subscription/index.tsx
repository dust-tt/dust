import { SubscriptionPage } from "@app/components/pages/workspace/subscription/SubscriptionPage";
import { adminGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForAdmin } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForAdmin;

const PageWithAuthLayout = SubscriptionPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = adminGetLayout;

export default PageWithAuthLayout;
