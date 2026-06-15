import { useSearchParam } from "@app/lib/platform";
import { useEffect } from "react";

const setOgReady = () => document.body.setAttribute("data-og-ready", "true");

export function ShareOgPage() {
  const name = useSearchParam("name") ?? "";
  const logoUrl = useSearchParam("logoUrl") ?? "";

  // When there is no logo, signal ready immediately after mount.
  useEffect(() => {
    if (!logoUrl) {
      setOgReady();
    }
  }, [logoUrl]);

  return (
    <div className="relative flex h-[630px] w-[1200px] items-center overflow-hidden bg-gray-50 pl-16">
      <div className="absolute right-[-343px] top-[479px] size-40 origin-top-left rotate-[33.49deg] rounded-tl-full rounded-tr-full bg-brand-sky-blue" />
      <div className="absolute right-[-257px] top-[302px] h-32 w-44 origin-top-left -rotate-45 bg-lime-200" />
      <div className="absolute right-[-160px] top-14 h-[523px] w-[893px] overflow-hidden rounded-2xl bg-white outline outline-[6px] outline-neutral-50 shadow-[0px_0px_0px_2px_rgba(207,207,207,0.25),0px_-1px_14px_3px_rgba(0,0,0,0.05)]" />
      <div className="relative z-10 flex w-80 flex-col items-start gap-6">
        {logoUrl && (
          <img
            src={logoUrl}
            className="h-12 w-52 object-contain"
            onLoad={setOgReady}
            onError={setOgReady}
          />
        )}
        <h1 className="break-words font-['Geist'] text-[60px] font-normal leading-[64px] text-black">
          {name}
        </h1>
      </div>
    </div>
  );
}
