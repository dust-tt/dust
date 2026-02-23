import config from "@app/lib/api/config";
import { useAppRouter, useSearchParam } from "@app/lib/platform";
import { useUser } from "@app/lib/swr/user";
import { Button, Logo } from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

export function SsoEnforcedPage() {
  const router = useAppRouter();
  const workspaceId = useSearchParam("workspaceId");
  const returnTo = useSearchParam("returnTo");
  const { user } = useUser();

  // Match the workspace sId to a WorkOS organization via externalId.
  const organization = user?.organizations?.find(
    (org) => org.externalId === workspaceId
  );

  const loginUrl = useMemo(() => {
    if (!organization) {
      return null;
    }
    const base = `${config.getApiBaseUrl()}/api/workos/login?organizationId=${organization.id}`;
    return returnTo ? `${base}&returnTo=${encodeURIComponent(returnTo)}` : base;
  }, [organization, returnTo]);

  // Redirect to 404 if no workspaceId or no matching org.
  useEffect(() => {
    if (!workspaceId || (user && !organization)) {
      void router.replace("/404");
    }
  }, [workspaceId, user, organization, router]);

  if (!loginUrl) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 top-0 -z-50 bg-primary-800" />
      <main className="z-10 mx-6">
        <div className="container mx-auto sm:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
          <div style={{ height: "10vh" }}></div>
          <div className="grid grid-cols-1">
            <div>
              <Logo className="h-[48px] w-[192px] px-1" />
            </div>
            <p className="mt-16 text-4xl font-semibold tracking-tighter text-primary-50 md:text-6xl">
              <span className="text-warning">Secure AI agent</span> <br />
              with your company's knowledge
              <br />
            </p>
          </div>
          <div className="h-10"></div>
          <div>
            <p className="font-base mb-8 text-muted-foreground dark:text-muted-foreground-night">
              Access requires Single Sign-On (SSO) authentication. Use your SSO
              provider to sign in.{" "}
            </p>
            <Button
              variant="highlight"
              label="Connect with SSO"
              size="md"
              href={loginUrl}
            />
          </div>
        </div>
      </main>
    </>
  );
}

export default SsoEnforcedPage;
