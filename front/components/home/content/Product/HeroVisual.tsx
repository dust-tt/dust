// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { BorderBeam } from "@app/components/magicui/border-beam";
import UTMButton from "@app/components/UTMButton";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { PlayIcon } from "@dust-tt/sparkle";
import Image from "next/image";

interface HeroVisualProps {
  onWatch: () => void;
  showVideo: boolean;
}

export function HeroVisual({ onWatch, showVideo }: HeroVisualProps) {
  const videoUrl = new URL(
    "https://fast.wistia.net/embed/iframe/3eqngftomq?seo=true&videoFoam=true"
  );
  if (showVideo) {
    videoUrl.searchParams.set("autoPlay", "true");
    videoUrl.searchParams.set("muted", "true");
    videoUrl.searchParams.set("playsinline", "true");
  }

  return (
    <div className="relative w-full sm:-mt-6 md:mt-0 lg:mt-12">
      <div className="relative mx-auto w-full max-w-[2000px]">
        <div className="overflow-hidden rounded-4xl bg-gray-100 p-1 sm:p-2 md:p-3 lg:p-4">
          <div className="relative flex aspect-[16/9] items-center justify-center">
            <div className="relative h-full w-full overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl">
              {showVideo ? (
                <iframe
                  src={videoUrl.toString()}
                  title="Dust product tour"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl"
                />
              ) : (
                <Image
                  src="/static/landing/header/header.jpg"
                  alt="Dust Platform"
                  width={1920}
                  height={1080}
                  className="rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl"
                  style={{ maxWidth: "100%", height: "auto" }}
                  priority
                />
              )}
            </div>
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg sm:rounded-xl md:rounded-2xl lg:rounded-3xl">
              <BorderBeam
                size={400}
                duration={10}
                colorFrom="#CDCDCD"
                colorTo="#CDCDCD"
              />
            </div>
          </div>
        </div>
      </div>
      {!showVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <UTMButton
            variant="primary"
            size="md"
            label="Watch Dust in motion"
            icon={PlayIcon}
            onClick={withTracking(
              TRACKING_AREAS.HOME,
              "hero_watch_video",
              () => {
                onWatch();
              }
            )}
            className="shadow-[0_8px_16px_-2px_rgba(0,0,0,0.3),0_4px_8px_-2px_rgba(255,255,255,0.1)] transition-all duration-300 hover:shadow-[0_16px_40px_-2px_rgba(255,255,255,0.2),0_8px_20px_-4px_rgba(255,255,255,0.15)]"
          />
        </div>
      )}
    </div>
  );
}
