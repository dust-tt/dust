import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

export function ClosingCtaSection() {
  return (
    <section className="py-16 lg:py-24">
      <div className="rounded-3xl bg-emerald-950 px-8 py-16 text-center md:px-16 md:py-20 lg:px-24 lg:py-24">
        <h2 className="mx-auto mb-6 max-w-3xl font-objektiv text-3xl font-medium tracking-tight text-white md:text-4xl lg:text-5xl">
          The best teams aren&rsquo;t just using&nbsp;AI — they&rsquo;re
          running&nbsp;it.
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-emerald-200">
          There&rsquo;s a new kind of person emerging in fast-moving companies —
          someone who doesn&rsquo;t wait for an AI tool to be handed to them.
          They build it, deploy it, and run it for their whole team. We call them
          AI operators.
        </p>
        <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-emerald-300">
          At companies like Datadog, 1Password, Cursor, Vanta, Persona, Clay,
          and Qonto, thousands of AI operators have deployed over 300,000 agents.
          They&rsquo;ve rewired how their teams work, achieved 70% weekly active
          usage, and expanded every single renewal.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="https://dust.tt/home/signup">
            <Button
              label="Become an AI operator"
              variant="highlight"
              size="lg"
            />
          </Link>
        </div>
        <p className="mt-6 text-sm text-emerald-400">
          We&rsquo;re hiring across engineering, marketing, sales, and customer
          success.{" "}
          <Link
            href="https://dust.tt/jobs"
            className="underline underline-offset-4 transition hover:text-emerald-200"
          >
            &rarr; dust.tt/jobs
          </Link>
        </p>
      </div>
    </section>
  );
}
