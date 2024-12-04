import { H4 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

export default function TrustedBy() {
  return (
    <>
      <div
        className={classNames(
          "col-span-12 flex flex-col items-center py-8",
          "lg:col-span-10 lg:col-start-2",
          "xl:col-span-8 xl:col-start-3"
        )}
      >
        <H4 className="w-full text-center text-white">
          Trusted by 500+ organizations, including:
        </H4>
        <div
          className={classNames(
            "max-w-[400px] sm:w-full sm:max-w-none",
            "grid grid-cols-2 gap-x-2",
            "md:grid-cols-5 md:gap-x-12"
          )}
        >
          <img alt="alan" src="/static/landing/logos/alan.png" />
          <img alt="qonto" src="/static/landing/logos/qonto.png" />
          <img alt="pennylane" src="/static/landing/logos/pennylane.png" />
          <img alt="payfit" src="/static/landing/logos/payfit.png" />
          <img alt="watershed" src="/static/landing/logos/watershed.png" />
        </div>
      </div>
    </>
  );
}
