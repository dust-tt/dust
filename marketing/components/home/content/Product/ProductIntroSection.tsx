// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H1, P } from "@marketing/components/home/ContentComponents";
import {
  HomeReveal,
  HomeRevealStyles,
} from "@marketing/components/home/content/Product/HomeReveal";
import { RotatingWord } from "@marketing/components/home/content/Product/RotatingWord";
import { Button, Rocket02 } from "@dust-tt/sparkle";
import Link from "next/link";

export function ProductIntroSection() {
  return (
    <div className="sm:pt-18 w-full pb-12 pt-12 lg:pt-36">
      <HomeRevealStyles />
      <div className="flex flex-col gap-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 text-center sm:gap-2 lg:px-6">
          <HomeReveal>
            <H1 className="text-center text-5xl font-semibold md:text-6xl lg:text-7xl">
              Multiplayer AI for <RotatingWord />
            </H1>
          </HomeReveal>
          <HomeReveal delay={80}>
            <P size="lg" className="text-base text-muted-foreground sm:text-lg">
              Dust is multiplayer, multi-model AI that gives digital teams of
              people and agents a single place to work together in parallel,
              with shared knowledge, tools, and skills, and governed by design.
            </P>
          </HomeReveal>
          <HomeReveal delay={160}>
            <div className="mt-4 flex flex-row justify-center gap-4">
              <Link href="/home/contact" shallow={true}>
                <Button variant="highlight" size="md" label="Contact Sales" />
              </Link>
              <Link href="/home/pricing" shallow={true}>
                <Button
                  variant="outline"
                  size="md"
                  label="Try Dust Now"
                  icon={Rocket02}
                />
              </Link>
            </div>
          </HomeReveal>
        </div>
      </div>
    </div>
  );
}
