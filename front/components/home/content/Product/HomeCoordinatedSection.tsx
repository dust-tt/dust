// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2, P } from "@app/components/home/ContentComponents";
import { HomeEyebrow } from "@app/components/home/content/Product/HomeEyebrow";
import { HomeReveal } from "@app/components/home/content/Product/HomeReveal";
import Image from "next/image";

export function HomeCoordinatedSection() {
  return (
    <section className="w-full bg-background py-24">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col items-center gap-12 px-6 lg:flex-row-reverse lg:items-center lg:gap-20">
        <div className="flex w-full flex-col gap-6 lg:w-1/2">
          <HomeReveal>
            <HomeEyebrow label="Intelligent context layer" />
          </HomeReveal>
          <HomeReveal delay={80}>
            <H2 className="text-balance font-semibold leading-[1.08] tracking-[-0.03em] text-foreground">
              Your company's knowledge,
              <br />
              <span className="text-blue-500">
                deeply understood and actioned on
              </span>
            </H2>
          </HomeReveal>
          <HomeReveal delay={160}>
            <P
              size="sm"
              className="max-w-[480px] leading-[1.6] text-muted-foreground"
            >
              Any tool can pull from Slack or your CRM. Dust goes further –
              with a semantic layer that synthesizes your company's knowledge so
              agents don't just retrieve information – they understand it.
            </P>
          </HomeReveal>
        </div>
        <HomeReveal
          variant="photo"
          delay={120}
          className="flex w-full justify-center self-stretch lg:w-1/2"
        >
          <div className="flex w-full max-w-[520px] items-center justify-center self-stretch rounded-3xl bg-blue-50 p-8">
            <Image
              src="/static/landing/home/coordinated-flow.png"
              alt="Dust coordinating a Zendesk ticket through classification, CRM update, and reply"
              width={880}
              height={840}
              className="m-auto h-auto w-full max-w-[420px] object-contain"
              priority={false}
            />
          </div>
        </HomeReveal>
      </div>
    </section>
  );
}
