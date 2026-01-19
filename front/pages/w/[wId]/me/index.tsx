import { ProfilePage } from "@app/components/pages/ProfilePage";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import type { AuthContextValue } from "@app/lib/auth/AuthContext";
import { AuthContext } from "@app/lib/auth/AuthContext";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps =
  withDefaultUserAuthRequirements<AuthContextValue>(async (_context, auth) => {
    const user = auth.user();
    const workspace = auth.workspace();
    const subscription = auth.subscription();
    const plan = auth.plan();

    if (!workspace || !subscription || !plan || !user) {
      return {
        notFound: true,
      };
    }

    return {
      props: {
        workspace,
        user: user.toJSON(),
        subscription,
        isAdmin: auth.isAdmin(),
        isBuilder: auth.isBuilder(),
      },
    };
  });

export default function ProfilePageWrapper(props: AuthContextValue) {
  return (
    <AuthContext.Provider value={props}>
      <ProfilePage />
    </AuthContext.Provider>
  );
}

ProfilePageWrapper.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
