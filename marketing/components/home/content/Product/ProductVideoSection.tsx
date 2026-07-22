import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import { useEffect, useState } from "react";

// Self-hosted product overview (no third-party player chrome).
const VIDEO_SRC =
  "/static/landing/product/Dust%20-%20Self-improving%20Skills%20-%20V4.mp4";

export function ProductVideoSection() {
  // Controls appear on hover for pointer devices; always visible on touch
  // devices (no hover) so playback stays controllable.
  const [showControls, setShowControls] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia("(hover: none)").matches);
  }, []);

  return (
    <section className="w-full bg-background py-14 lg:py-24">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <HomeReveal>
          {/* 16:9 responsive frame; scales fluidly with the viewport. */}
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-muted pt-[56.25%] shadow-sm"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
          >
            <video
              src={VIDEO_SRC}
              title="Dust product overview"
              // Muted is required for browsers to allow autoplay.
              autoPlay
              muted
              loop
              playsInline
              controls={isTouch || showControls}
              preload="auto"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
