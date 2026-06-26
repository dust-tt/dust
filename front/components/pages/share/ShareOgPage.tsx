import { useSearchParam } from "@app/lib/platform";
import { useCallback, useEffect } from "react";

export function ShareOgPage() {
  const name = useSearchParam("name") ?? "";
  const logoUrl = useSearchParam("logoUrl") ?? "";

  const setOgReady = useCallback(() => {
    document.body.setAttribute("data-og-ready", "true");
  }, []);

  // When there is no logo, signal ready immediately after mount.
  useEffect(() => {
    if (!logoUrl) {
      setOgReady();
    }
  }, [logoUrl, setOgReady]);

  return (
    <div className="relative flex h-screen w-screen items-center overflow-hidden bg-gray-50 pl-16">
      <div className="absolute right-[-343px] top-[479px] size-40 origin-top-left rotate-[33.49deg] rounded-tl-full rounded-tr-full bg-brand-sky-blue" />
      <div className="absolute right-[-257px] top-[302px] h-32 w-44 origin-top-left -rotate-45 bg-lime-200" />
      <div className="absolute inset-y-14 -right-40 left-1/3 overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-neutral-100" />
      <div className="relative z-10 flex w-80 flex-col items-start gap-6">
        {logoUrl && (
          <img
            src={logoUrl}
            className="h-12 w-52 object-contain"
            onLoad={setOgReady}
            onError={setOgReady}
          />
        )}
        <h1 className="break-words font-sans text-6xl font-normal text-black">
          {name}
        </h1>
      </div>
    </div>
  );
}
