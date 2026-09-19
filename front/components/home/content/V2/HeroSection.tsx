import { H1, P } from "@app/components/home/ContentComponents";
import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

export function HeroSection() {
  return (
    <div className="w-full pt-12 sm:pt-18 lg:pt-36">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">
          The Platform for AI Operators
        </p>
        <H1
          mono
          className="text-center text-5xl font-medium md:text-6xl lg:text-7xl"
        >
          AI for the people
          <br />
          who run the&nbsp;work.
        </H1>
        <P size="lg" className="max-w-2xl text-base text-muted-foreground">
          Turn scattered knowledge and tools into coordinated execution with AI
          agents that fast-moving teams build, own, and run themselves.
        </P>
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          <Link href="https://dust.tt/home/signup">
            <Button label="Try Dust" variant="highlight" size="md" />
          </Link>
          <Link
            href="/home/product"
            className="font-medium text-highlight hover:underline"
          >
            See how it works &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
