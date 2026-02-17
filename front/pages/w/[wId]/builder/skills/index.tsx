import { ManageSkillsPage } from "@app/components/pages/builder/skills/ManageSkillsPage";
import { appGetLayout } from "@app/lib/auth/appGetLayout";
import type { AppPageWithLayout } from "@app/lib/auth/appServerSideProps";
import { appGetServerSidePropsForBuilders } from "@app/lib/auth/appServerSideProps";

export const getServerSideProps = appGetServerSidePropsForBuilders;

const PageWithAuthLayout = ManageSkillsPage as AppPageWithLayout;

PageWithAuthLayout.getLayout = appGetLayout;

export default PageWithAuthLayout;
