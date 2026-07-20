import { HomeReveal } from "@marketing/components/home/content/Product/HomeReveal";
import UTMButton from "@marketing/components/UTMButton";
import { useEffect, useRef } from "react";

interface FeatureItem {
  id: string;
  title: string;
  description: string;
  // Figma node 3942:1729 — 125deg pastel gradient per card panel.
  panelGradient: string;
  imageSrc?: string;
  videoSrc?: string;
  ctaLabel: string;
  ctaHref: string;
}

const features: FeatureItem[] = [
  {
    id: "pods",
    title: "Pods",
    description:
      "Persistent shared workspace where humans and agents collaborate around any topic, project, or initiative. Shared conversations, tasks, files and agents, all in one place.",
    panelGradient: "linear-gradient(125deg, #FFF1F7 0.54%, #FFC3DF 100%)",
    videoSrc: "/static/landing/product/PODS_Website-asset%201.mp4",
    ctaLabel: "Learn more",
    ctaHref:
      "https://docs.dust.tt/changelog/pods-a-shared-workspace-for-your-team-and-your-agents",
  },
  {
    id: "skill",
    title: "Self-improving skill",
    description:
      "Skills that get smarter with every use. As your team runs agents, the system learns and improves, compounding your organization's intelligence over time without any manual effort.",
    panelGradient: "linear-gradient(125deg, #E9F7FF 0.54%, #9FDBFF 100%)",
    videoSrc: "/static/landing/product/Self-improving%20Skills.mp4",
    ctaLabel: "Learn more",
    ctaHref:
      "https://dust.tt/blog/introducing-self-improving-skills-reusable-ai-capabilities",
  },
];

// Plays on hover for pointer devices; autoplays on touch devices (no hover).
function HoverAutoplayVideo({ src, alt }: { src: string; alt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (window.matchMedia("(hover: none)").matches) {
      video.play().catch(() => {});
    }
  }, []);

  return (
    <video
      ref={videoRef}
      src={src}
      aria-label={alt}
      muted
      loop
      playsInline
      preload="metadata"
      className="absolute inset-0 h-full w-full object-cover"
      onMouseEnter={(e) => e.currentTarget.play()}
      onMouseLeave={(e) => {
        e.currentTarget.pause();
        e.currentTarget.currentTime = 0;
      }}
    />
  );
}

export function InteractiveFeaturesSection() {
  return (
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] flex w-screen flex-col gap-[48px] bg-[#020618] py-[128px]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center px-6">
        <HomeReveal>
          <h2 className="m-0 py-[8px] text-center font-sans text-[48px] font-normal leading-[52px] tracking-[-0.06em] text-white">
            Capabilities built for AI Operator
          </h2>
        </HomeReveal>
      </div>

      <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-[16px] px-6 md:grid-cols-2">
        {features.map((feature, i) => (
          <HomeReveal key={feature.id} delay={80 + i * 80} className="h-full">
            <div className="flex h-full flex-col items-center gap-[32px] rounded-[16px] bg-[#090F2A] p-[32px]">
              <div
                className="relative h-[286px] w-full shrink-0 overflow-hidden rounded-[8px]"
                style={{ backgroundImage: feature.panelGradient }}
              >
                {feature.videoSrc ? (
                  <HoverAutoplayVideo
                    src={feature.videoSrc}
                    alt={feature.title}
                  />
                ) : (
                  feature.imageSrc && (
                    <img
                      src={feature.imageSrc}
                      alt={feature.title}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )
                )}
              </div>
              <div className="flex w-full flex-1 flex-col items-center gap-[16px]">
                <h4 className="m-0 text-center font-sans text-[32px] font-semibold leading-[30px] tracking-[-0.03em] text-white">
                  {feature.title}
                </h4>
                <p className="m-0 text-center font-sans text-[16px] leading-[25.6px] tracking-[-0.02em] text-white/70">
                  {feature.description}
                </p>
              </div>
              <UTMButton
                variant="outline"
                size="sm"
                label={feature.ctaLabel}
                href={feature.ctaHref}
              />
            </div>
          </HomeReveal>
        ))}
      </div>
    </div>
  );
}
