// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { P } from "@app/components/home/ContentComponents";
import type { HeroTestimonial } from "@app/components/home/content/Competitive/TestimonialSlider";
import { TestimonialSlider } from "@app/components/home/content/Competitive/TestimonialSlider";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { appendUTMParams } from "@app/lib/utils/utm";
import { ArrowRightIcon, Button, CheckIcon, Icon } from "@dust-tt/sparkle";
import Image from "next/image";

interface ChatGptEnterpriseDeepDiveProps {
  pros: string[];
  testimonials: HeroTestimonial[];
}

export function ChatGptEnterpriseDeepDive({
  pros,
  testimonials,
}: ChatGptEnterpriseDeepDiveProps) {
  return (
    <section id="dust-deep-dive" className="w-full pt-4 pb-12 md:pt-8 md:pb-24">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-3xl border-2 border-[#1C91FF] bg-white shadow-2xl shadow-[#1C91FF]/10">
          {/* Blue header */}
          <div className="flex flex-col justify-between gap-4 bg-[#1C91FF] px-8 py-6 text-white md:flex-row md:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 py-1 pl-1 pr-3 text-xs font-bold uppercase tracking-wider backdrop-blur-sm">
                <div className="flex -space-x-2">
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[#1C91FF] bg-white">
                    <Image
                      src="/static/landing/logos/gray/vanta.svg"
                      alt="Vanta"
                      width={16}
                      height={16}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[#1C91FF] bg-white">
                    <Image
                      src="/static/landing/logos/gray/persona.svg"
                      alt="Persona"
                      width={16}
                      height={16}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[#1C91FF] bg-white">
                    <Image
                      src="/static/landing/logos/gray/whatnot.svg"
                      alt="WhatNot"
                      width={16}
                      height={16}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-[#1C91FF] bg-white">
                    <Image
                      src="/static/landing/logos/gray/assembled.svg"
                      alt="Assembled"
                      width={16}
                      height={16}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                </div>
                <span>
                  Vanta, Persona, WhatNot, &amp; Assembled&apos;s top pick
                </span>
              </div>
              <h2 className="text-3xl font-bold">
                Dust — Best for specialized AI agents connected to company
                knowledge
              </h2>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium uppercase tracking-wider opacity-80">
                Starting at
              </p>
              <p className="text-3xl font-bold">
                $29
                <span className="text-xl font-normal opacity-80">/mo</span>
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="p-8 md:p-12">
            <p className="mb-10 text-xl font-medium leading-relaxed text-gray-700">
              <span className="text-[#1C91FF]">Not just a chat interface,</span>{" "}
              Dust is an AI platform purpose-built for team collaboration at
              scale, with specialized agents, deep company data integration, and
              multi-model flexibility.
            </p>

            <div className="grid gap-12 md:grid-cols-2">
              {/* Pros */}
              <div>
                <h3 className="mb-6 flex items-center gap-2 text-xl font-bold text-[#111418]">
                  <Icon visual={CheckIcon} className="h-6 w-6 text-green-500" />
                  Why Dust Wins
                </h3>
                <ul className="space-y-4">
                  {pros.map((pro) => (
                    <li key={pro} className="flex items-start gap-3">
                      <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green-500" />
                      <span className="leading-relaxed text-gray-700">
                        {pro}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Compounding effect card */}
              <div className="h-fit rounded-2xl border border-gray-100 bg-gray-50 p-8">
                <h3 className="mb-4 text-lg font-bold text-[#111418]">
                  The Compounding Effect
                </h3>
                <P size="sm" className="mb-6 text-muted-foreground">
                  Dust agents are shared across your team. When one person
                  improves an agent&apos;s instructions or adds a new data
                  source, everyone benefits instantly.
                </P>
                <div className="border-t border-gray-200 pt-6">
                  <p className="mb-2 text-sm font-bold text-gray-800">
                    Proven Adoption
                  </p>
                  <P size="sm" className="text-muted-foreground">
                    Companies like Vanta and Persona see{" "}
                    <span className="font-bold text-[#1C91FF]">
                      70-90% team usage
                    </span>{" "}
                    vs. the 20-40% typically seen with standard enterprise AI
                    platforms.
                  </P>
                </div>

                <div className="mt-8">
                  <Button
                    variant="primary"
                    size="md"
                    label="Book a demo"
                    icon={ArrowRightIcon}
                    onClick={withTracking(
                      TRACKING_AREAS.COMPETITIVE,
                      "chatgpt_enterprise_deep_dive_demo",
                      () => {
                        // eslint-disable-next-line react-hooks/immutability
                        window.location.href = appendUTMParams("/home/contact");
                      }
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Testimonial slider */}
            <div className="mt-16 border-t border-gray-100 pt-12">
              <TestimonialSlider testimonials={testimonials} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
