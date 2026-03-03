// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import Image from "next/image";

interface ChatGptEnterpriseLogoBarProps {
  title: string;
}

export function ChatGptEnterpriseLogoBar({
  title,
}: ChatGptEnterpriseLogoBarProps) {
  return (
    <section className="w-full">
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen border-y border-gray-100 bg-gray-50/50 py-6 md:py-10">
        <div className="mx-auto max-w-7xl px-6">
          <p className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </p>
          <div className="mx-auto flex max-w-5xl justify-start overflow-x-auto pb-4 opacity-60 grayscale transition-all duration-500 hover:grayscale-0 sm:justify-center sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
            <Image
              src="/static/landing/chatgpt-enterprise/customer_logos.png"
              alt="Trusted by leading teams like Clay, Vanta, Assembled, and more"
              width={800}
              height={80}
              className="h-auto w-[800px] max-w-none flex-shrink-0 object-contain mix-blend-multiply sm:w-full sm:max-w-full"
              unoptimized
            />
          </div>
        </div>
      </div>
    </section>
  );
}
