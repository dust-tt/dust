import { HomeTrustedMarqueeCompact } from "@marketing/components/home/content/Product/HomeTrustedSection";
import { PageMetadata } from "@marketing/components/home/PageMetadata";
import { PublicWebsiteLogo } from "@marketing/components/home/PublicWebsiteLogo";
import { Button, Download01 } from "@dust-tt/sparkle";
import Image from "next/image";

// Ungated public endpoint that streams the canonical PDF as an attachment (see
// pages/api/home/ebook/ai-enterprise-playbook.ts).
const EBOOK_DOWNLOAD_URL =
  "/m/api/home/ebook/ai-enterprise-playbook?download=1";

// Dust contact / demo request form.
const BOOK_DEMO_URL = "/home/contact";

// Standalone page: rendered bare, without LandingLayout, so there is no nav,
// footer, or cookie/promo banner — just the Dust logo and the ebook hero.
// biome-ignore lint/plugin/nextjsPageComponentNaming: pre-existing
export default function EbookDownload() {
  return (
    <>
      <PageMetadata
        title="The Multiplayer AI Playbook | Dust"
        description="Download the AI Enterprise Playbook for free. A leader's guide to building, deploying, and scaling AI agents, based on insights from 100+ companies using Dust."
        pathname="/home/landing/ebook-download"
      />

      <div className="flex min-h-screen w-full flex-col bg-background font-sans">
        {/* Dust logo */}
        <div className="flex w-full justify-center pt-12 pb-2">
          <PublicWebsiteLogo />
        </div>

        <main className="flex flex-1 items-center justify-center">
          <div className="mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-10 lg:py-20">
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left — Title, subtitle, trusted, CTAs */}
              <div className="flex flex-col gap-8">
                <h1
                  className="m-0 text-balance text-[clamp(36px,4vw,60px)] font-semibold leading-[95%] tracking-[-0.03em] text-foreground"
                  style={{ fontFamily: "var(--font-sans, inherit)" }}
                >
                  The Multiplayer AI Playbook
                </h1>
                <p className="copy-lg max-w-[520px] text-pretty leading-[1.55] text-muted-foreground">
                  A leader&apos;s guide to building your AI Operator workforce,
                  based on insights from 100+ companies using Dust.
                </p>
                <HomeTrustedMarqueeCompact />
                <div className="flex flex-wrap gap-3">
                  <Button
                    label="Download the ebook"
                    variant="highlight"
                    size="md"
                    icon={Download01}
                    href={EBOOK_DOWNLOAD_URL}
                  />
                  {/* Trailing arrow via the label: sparkle's Button only
                      renders leading icons, so the arrow lives in the text. */}
                  <Button
                    label="Book a demo →"
                    variant="ghost"
                    size="md"
                    href={BOOK_DEMO_URL}
                    className="bg-white"
                  />
                </div>
              </div>

              {/* Right — Ebook visual */}
              <div className="flex justify-center lg:justify-end">
                <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-black/5">
                  <Image
                    src="/static/landing/ebook/multiplayer-ai-playbook-cover.svg"
                    alt="The Multiplayer AI Playbook"
                    width={420}
                    height={595}
                    priority
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
