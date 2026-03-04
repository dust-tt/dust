// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import { Button } from "@dust-tt/sparkle";
import { motion } from "framer-motion";
import Image from "next/image";
import type { ReactNode } from "react";

interface ChatGptEnterpriseHeroSectionProps {
  headline: ReactNode;
  subtitle: string;
  ctaButtonText: string;
  ctaButtonLink: string;
  secondaryButtonText: string;
  secondaryButtonLink: string;
}

export function ChatGptEnterpriseHeroSection({
  headline,
  subtitle,
  ctaButtonText,
  ctaButtonLink,
  secondaryButtonText,
  secondaryButtonLink,
}: ChatGptEnterpriseHeroSectionProps) {
  return (
    <section className="w-full">
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen overflow-hidden bg-white px-6 pb-12 pt-20">
        {/* Animated geometric background */}
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <motion.div
            className="absolute -top-32 left-[30%] h-64 w-64 rounded-full bg-[#FFC4D9] opacity-30"
            animate={{ y: [0, 15, 0] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute -top-16 left-[20%] h-32 w-32 bg-[#EE5338] opacity-20"
            animate={{ rotate: [0, 5, 0] }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute -left-12 top-[20%] h-80 w-32 rounded-r-2xl bg-[#489467] opacity-20"
            animate={{ x: [0, 10, 0] }}
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />
          <motion.div
            className="absolute -bottom-20 left-0 h-64 w-80 rounded-tr-[100px] bg-[#FF9F1C] opacity-25"
            animate={{ y: [0, -10, 0] }}
            transition={{
              duration: 11,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-[#96D3FF] opacity-30"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 2,
            }}
          />
          <motion.div
            className="absolute bottom-0 right-[15%] h-32 w-32 rounded-full bg-[#E5F58D] opacity-40"
            animate={{ y: [0, -15, 0] }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl text-center">
          <motion.div
            className="mx-auto max-w-4xl space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Headline with orbiting Dust logo */}
            <div className="relative flex w-full flex-col items-center justify-center py-8 md:py-12">
              <motion.h1
                className="relative z-10 max-w-4xl text-center text-4xl font-bold leading-[1.1] tracking-tight text-[#111418] sm:text-5xl md:text-6xl lg:text-[72px]"
                animate={{ scale: [1, 1.01, 1] }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                {headline}
              </motion.h1>

              {/* Orbiting Dust logo */}
              <div className="pointer-events-none absolute inset-0 z-20 hidden md:block">
                <div className="absolute bottom-0 left-[-5%] right-[-5%] top-0 rounded-[120px] border-2 border-dashed border-[#1C91FF]/20" />
              </div>
              <motion.div
                className="pointer-events-none absolute z-30 hidden md:block"
                style={{ x: "-50%", y: "-50%" }}
                animate={{
                  left: ["15%", "85%", "105%", "85%", "15%", "-5%", "15%"],
                  top: ["0%", "0%", "50%", "100%", "100%", "50%", "0%"],
                  rotate: [0, 0, 90, 180, 180, 270, 360],
                }}
                transition={{
                  duration: 7,
                  repeat: Infinity,
                  ease: "linear",
                  times: [0, 0.3, 0.4, 0.5, 0.8, 0.9, 1],
                }}
              >
                <div className="relative flex items-center justify-center">
                  <div className="absolute right-full mr-1 flex flex-col gap-1.5 opacity-80">
                    <motion.div
                      className="h-1 w-10 rounded-full bg-gradient-to-l from-[#1C91FF] to-transparent"
                      animate={{
                        opacity: [0.3, 1, 0.3],
                        scaleX: [0.6, 1.2, 0.6],
                      }}
                      transition={{ duration: 0.2, repeat: Infinity }}
                      style={{ originX: 1 }}
                    />
                    <motion.div
                      className="ml-auto h-1 w-6 rounded-full bg-gradient-to-l from-[#FFAA0D] to-transparent"
                      animate={{
                        opacity: [0.3, 1, 0.3],
                        scaleX: [0.5, 1.3, 0.5],
                      }}
                      transition={{
                        duration: 0.15,
                        repeat: Infinity,
                        delay: 0.1,
                      }}
                      style={{ originX: 1 }}
                    />
                  </div>
                  <div className="rounded-xl border border-[#1C91FF]/40 bg-white/95 p-2 shadow-[0_4px_20px_rgba(28,145,255,0.4)] backdrop-blur-sm">
                    <Image
                      src="/static/landing/chatgpt-enterprise/dust_logo.svg"
                      alt="Dust"
                      width={40}
                      height={40}
                      unoptimized
                    />
                  </div>
                </div>
              </motion.div>
            </div>

            <p className="mx-auto max-w-3xl text-xl leading-relaxed text-gray-600">
              <span className="block font-medium text-[#111418]">
                {subtitle}
              </span>
            </p>

            {/* CTA buttons */}
            <div className="relative z-20 flex w-full flex-col justify-center gap-4 px-4 pt-4 sm:flex-row sm:px-0">
              <Button
                variant="highlight"
                size="md"
                label={ctaButtonText}
                onClick={withTracking(
                  TRACKING_AREAS.COMPETITIVE,
                  "chatgpt_enterprise_hero_comparison",
                  () => {
                    const el = document.getElementById("dust-deep-dive");
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth" });
                    }
                  }
                )}
              />
              <Button
                variant="outline"
                size="md"
                label={secondaryButtonText}
                onClick={withTracking(
                  TRACKING_AREAS.COMPETITIVE,
                  "chatgpt_enterprise_hero_expert",
                  () => {
                    // eslint-disable-next-line react-hooks/immutability
                    window.location.href = appendUTMParams(secondaryButtonLink);
                  }
                )}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
