import Image from "next/image";

import { H3 } from "@app/components/home/ContentComponents";
import { classNames } from "@app/lib/utils";

const LOGOS = [
  { name: "alan", src: "/static/landing/logos/gray/alan.png" },
  { name: "watershed", src: "/static/landing/logos/gray/watershed.png" },
  { name: "qonto", src: "/static/landing/logos/gray/qonto.png" },
  { name: "pennylane", src: "/static/landing/logos/gray/pennylane.png" },
  { name: "payfit", src: "/static/landing/logos/gray/payfit.png" },
  { name: "malt", src: "/static/landing/logos/gray/malt.png" },
  { name: "doctolib", src: "/static/landing/logos/gray/doctolib.png" },
  { name: "blueground", src: "/static/landing/logos/gray/blueground.png" },
  { name: "clay", src: "/static/landing/logos/gray/clay.png" },
  { name: "photoroom", src: "/static/landing/logos/gray/photoroom.png" },
];

export default function TrustedBy() {
  return (
    <div
      className={classNames(
        "col-span-12 flex flex-col items-center py-4",
        "lg:col-span-12 lg:col-start-1",
        "xl:col-span-10 xl:col-start-2"
      )}
    >
      <H3 className="w-full text-center">Trusted by 1,000+ organizations</H3>

      <div className="mx-auto mt-8 w-full max-w-[1300px] px-2 sm:px-4">
        <div className="grid grid-cols-2 place-items-center gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {LOGOS.map((logo) => (
            <div
              key={logo.name}
              className="flex h-16 w-full max-w-[180px] items-center justify-center px-2 sm:h-20 sm:max-w-[200px] sm:px-3 md:h-24 md:max-w-[240px] md:px-4"
            >
              <Image
                alt={logo.name}
                src={logo.src}
                width={160}
                height={80}
                className="w-full"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
