import Image from "next/image";

import { H3 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export default function TrustedBy() {
  return (
    <>
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center py-8",
          "lg:col-span-12 lg:col-start-1",
          "xl:col-span-10 xl:col-start-2"
        )}
      >
        <H3 className="w-full text-center text-white">
          Trusted by 1000+ organizations
        </H3>
        <div className="mt-8 flex w-full flex-col items-center gap-y-8">
          {/* First row - 5 items */}
          <div className="flex w-full justify-center gap-x-24">
            {/* First 5 logos */}
            <Image
              alt="alan"
              src="/static/landing/logos/alan.png"
              width={250}
              height={100}
            />
            <Image
              alt="watershed"
              src="/static/landing/logos/watershed.png"
              width={250}
              height={100}
            />
            <Image
              alt="qonto"
              src="/static/landing/logos/qonto.png"
              width={250}
              height={100}
            />
            <Image
              alt="pennylane"
              src="/static/landing/logos/pennylane.png"
              width={250}
              height={100}
            />
            <Image
              alt="payfit"
              src="/static/landing/logos/payfit.png"
              width={250}
              height={100}
            />
          </div>
          {/* Second row - 4 items */}
          <div className="flex w-full justify-center gap-x-24">
            {/* Last 4 logos */}
            <Image
              alt="malt"
              src="/static/landing/logos/malt.png"
              width={250}
              height={100}
            />
            <Image
              alt="hivebrite"
              src="/static/landing/logos/hivebrite.png"
              width={250}
              height={100}
            />
            <Image
              alt="blueground"
              src="/static/landing/logos/blueground.png"
              width={250}
              height={100}
            />
            <Image
              alt="clay"
              src="/static/landing/logos/clay.png"
              width={250}
              height={100}
            />
          </div>
        </div>
      </div>
    </>
  );
}
