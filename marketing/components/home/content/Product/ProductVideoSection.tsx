import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";

const videoUrl = new URL("https://fast.wistia.net/embed/iframe/hyatgdecn7");
videoUrl.searchParams.set("seo", "true");
videoUrl.searchParams.set("videoFoam", "true");
videoUrl.searchParams.set("autoPlay", "true");
videoUrl.searchParams.set("muted", "true");
videoUrl.searchParams.set("playsinline", "true");
videoUrl.searchParams.set("playbar", "false");
videoUrl.searchParams.set("controlsVisibleOnLoad", "false");
videoUrl.searchParams.set("playButton", "false");
videoUrl.searchParams.set("smallPlayButton", "false");
videoUrl.searchParams.set("settingsControl", "false");
videoUrl.searchParams.set("fullscreenButton", "false");
videoUrl.searchParams.set("endVideoBehavior", "loop");
videoUrl.searchParams.set("captions", "on");

export function ProductVideoSection() {
  return (
    <section className="w-full bg-background py-14 lg:py-24">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <HomeReveal>
          <div className="relative w-full rounded-2xl pt-[56.25%]">
            {/* 16:9 aspect ratio */}
            <iframe
              src={videoUrl.toString()}
              title="Dust product overview"
              allow="autoplay; fullscreen"
              frameBorder="0"
              className="absolute inset-0 h-full w-full overflow-hidden rounded-2xl"
            />
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
