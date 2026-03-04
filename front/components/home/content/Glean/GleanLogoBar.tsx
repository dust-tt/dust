// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import Image from "next/image";

interface GleanLogoBarProps {
  title: string;
}

const LOGOS = [
  "blueground",
  "clay",
  "assembled",
  "laurel",
  "patch",
  "persona",
  "photoroom",
  "vanta",
  "qonto",
  "watershed",
  "whatnot",
];

export function GleanLogoBar({ title }: GleanLogoBarProps) {
  return (
    <section className="w-full">
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen border-y border-gray-100 bg-gray-50/50 py-6 md:py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </p>
          <div className="relative overflow-hidden opacity-60">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-gray-50/80 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-gray-50/80 to-transparent" />

            <div className="flex w-max animate-marquee items-center gap-x-12">
              {LOGOS.map((name) => (
                <Image
                  key={name}
                  src={`/static/landing/logos/gray/${name}.svg`}
                  alt={name}
                  width={200}
                  height={70}
                  className="h-[70px] w-auto shrink-0 md:h-14"
                  unoptimized
                />
              ))}
              {LOGOS.map((name) => (
                <Image
                  key={`${name}-dup`}
                  src={`/static/landing/logos/gray/${name}.svg`}
                  alt=""
                  width={200}
                  height={70}
                  className="h-[70px] w-auto shrink-0 md:h-14"
                  unoptimized
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
