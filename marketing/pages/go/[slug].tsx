import CustomErrorPage from "@marketing/components/pages/CustomErrorPage";
import { GoResolveSuccessSchema } from "@marketing/lib/go/schemas";
import { clientFetch } from "@marketing/lib/egress/client";
import { isString } from "@marketing/types/shared/utils/general";
import { LogIn01, SpinnerBrand } from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

type GoPageState = "loading" | "not_found" | "error";

export default function GoPageNextJS() {
  const router = useRouter();
  const [pageState, setPageState] = useState<GoPageState>("loading");
  const slug = router.query.slug;

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (!isString(slug) || slug.trim() === "") {
      setPageState("not_found");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await clientFetch(
          `/m/api/go/${encodeURIComponent(slug)}`,
          { credentials: "include" }
        );

        if (cancelled) {
          return;
        }

        if (response.status === 404) {
          setPageState("not_found");
          return;
        }

        if (!response.ok) {
          setPageState("error");
          return;
        }

        const parsed = GoResolveSuccessSchema.safeParse(await response.json());
        if (!parsed.success) {
          setPageState("error");
          return;
        }

        window.location.replace(parsed.data.destination);
      } catch {
        if (!cancelled) {
          setPageState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router.isReady, slug]);

  if (pageState === "not_found") {
    return (
      <CustomErrorPage
        title="404: Template not found"
        description="This conversation template doesn't exist or is no longer available."
        href="/"
        label="Back to homepage"
        icon={LogIn01}
      />
    );
  }

  if (pageState === "error") {
    return (
      <CustomErrorPage
        title="Something went wrong"
        description="We couldn't load this conversation template. Please try again later."
        href="/"
        label="Back to homepage"
        icon={LogIn01}
      />
    );
  }

  return (
    <div className="flex h-dvh items-center justify-center">
      <SpinnerBrand size="lg" />
    </div>
  );
}
