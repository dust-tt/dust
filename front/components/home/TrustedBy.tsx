import Image from "next/image";

import { H3 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export default function TrustedBy() {
  return (
    <div
      className={classNames(
        "col-span-12 flex flex-col items-center py-4",
        "lg:col-span-12 lg:col-start-1",
        "xl:col-span-10 xl:col-start-2"
      )}
    >
      <H3 className="w-full text-center text-white">
        Trusted by 1000+ organizations
      </H3>

      <div className="mx-auto mt-8 w-full max-w-screen-2xl px-8">
        <div className="grid grid-cols-2 place-items-center gap-8 sm:gap-2 sm:grid-cols-5">
          <Image
            alt="alan"
            src="/static/landing/logos/alan.png"
            width={200}
            height={80}
          />
          <Image
            alt="watershed"
            src="/static/landing/logos/watershed.png"
            width={200}
            height={80}
          />
          <Image
            alt="qonto"
            src="/static/landing/logos/qonto.png"
            width={200}
            height={80}
          />
          <Image
            alt="pennylane"
            src="/static/landing/logos/pennylane.png"
            width={200}
            height={80}
          />
          <Image
            alt="payfit"
            src="/static/landing/logos/payfit.png"
            width={200}
            height={80}
          />
          <Image
            alt="malt"
            src="/static/landing/logos/malt.png"
            width={200}
            height={80}
          />
          <Image
            alt="hivebrite"
            src="/static/landing/logos/hivebrite.png"
            width={200}
            height={80}
          />
          <Image
            alt="blueground"
            src="/static/landing/logos/blueground.png"
            width={200}
            height={80}
          />
          <Image
              alt="clay"
              src="/static/landing/logos/clay.png"
            width={200}
            height={80}
          />
          <Image
              alt="photoroom"
              src="/static/landing/logos/photoroom.png"
            width={200}
            height={80}
          />
        </div>
      </div>
    </div>
  );
}
