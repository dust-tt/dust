import Image from "next/image";

import { H3 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export default function TrustedBy() {
  return (
    <>
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center py-8",
          "lg:col-span-8 lg:col-start-3",
          "xl:col-span-8 xl:col-start-3"
        )}
      >
        <H3 className="w-full text-center text-white">
          Trusted by 500+ organizations, including:
        </H3>
        <div
          className={classNames(
            "mt-8 max-w-[400px] sm:w-full sm:max-w-none",
            "grid grid-cols-2 gap-x-2",
            "sm:grid-cols-3 md:gap-x-16"
          )}
        >
          <Image
            alt="alan"
            src="/static/landing/logos/alan.png"
            width={600}
            height={300}
          />
          <Image
            alt="watershed"
            src="/static/landing/logos/watershed.png"
            width={600}
            height={300}
          />
          <Image
            alt="qonto"
            src="/static/landing/logos/qonto.png"
            width={600}
            height={300}
          />
          <Image
            alt="pennylane"
            src="/static/landing/logos/pennylane.png"
            width={600}
            height={300}
          />
          <Image
            alt="payfit"
            src="/static/landing/logos/payfit.png"
            width={600}
            height={300}
          />
          <Image
            alt="watershed"
            src="/static/landing/logos/malt.png"
            width={600}
            height={300}
          />
        </div>
      </div>
    </>
  );
}
