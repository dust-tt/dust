import { Button } from "@dust-tt/sparkle";
import Link from "next/link";

import { H2 } from "@app/components/home/ContentComponents";

export function JustUseDustSection() {
  return (
    <div className="relative overflow-hidden rounded-xl bg-blue-50 py-12 md:py-16 lg:py-20">
      {/* Decorative shapes */}
      <div className="absolute left-0 top-0 h-48 w-48 -translate-x-1/3 -translate-y-1/3 rounded-full bg-pink-300" />
      <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/3 translate-x-1/3 rotate-45 bg-blue-400" />
      <div className="absolute bottom-0 left-0 h-40 w-40 -translate-x-1/3 translate-y-1/3 rounded-full bg-green-400" />
      <div className="absolute bottom-0 right-0 h-40 w-40 translate-x-1/3 translate-y-1/3 bg-red-400" />

      <div className="container mx-auto max-w-4xl px-6 lg:px-8">
        <div className="relative flex flex-col items-center justify-center py-8 text-center md:py-12">
          <H2 className="mb-8 text-3xl font-medium text-blue-600 md:text-4xl xl:text-5xl">
            Just use Dust
          </H2>
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Link href="/home/pricing" shallow={true}>
              <Button
                variant="highlight"
                size="md"
                label="Start Free Trial"
                className="w-full sm:w-auto"
              />
            </Link>
            <Link href="/home/contact" shallow={true}>
              <Button
                variant="outline"
                size="md"
                label="Contact Sales"
                className="w-full sm:w-auto"
              />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
