// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { H2, P } from "@app/components/home/ContentComponents";
import Image from "next/image";

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface TestimonialsGridSectionProps {
  testimonials: Testimonial[];
  title?: string;
}

function TestimonialCard({ quote, name, title, logo }: Testimonial) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-gray-50 p-6">
      <div className="mb-4 flex-1">
        <P size="sm" className="text-gray-700">
          "{quote}"
        </P>
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-gray-200 pt-4">
        <div className="mr-2 flex flex-col">
          <P size="sm" className="font-semibold text-gray-900">
            {name}
          </P>
          <P size="xs" className="text-gray-600">
            {title}
          </P>
        </div>
        <Image
          src={logo}
          width={80}
          height={32}
          alt="Company Logo"
          className="ml-2"
          unoptimized
        />
      </div>
    </div>
  );
}

export function TestimonialsGridSection({
  testimonials,
  title = "What teams are saying",
}: TestimonialsGridSectionProps) {
  return (
    <section className="w-full">
      <H2 className="mb-8 text-center">{title}</H2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <TestimonialCard key={index} {...testimonial} />
        ))}
      </div>
    </section>
  );
}
