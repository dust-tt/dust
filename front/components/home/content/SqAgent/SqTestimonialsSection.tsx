import { H2, P } from "@app/components/home/ContentComponents";
import Image from "next/image";

interface Testimonial {
  quote: string;
  name: string;
  title: string;
  logo: string;
}

interface SqTestimonialsSectionProps {
  title: string;
  subtitle: string;
  testimonials: Testimonial[];
}

function TestimonialCard({ quote, name, title, logo }: Testimonial) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-gray-50 p-6">
      <div className="mb-4 flex-1">
        <P size="sm" className="text-gray-700">
          &ldquo;{quote}&rdquo;
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

export function SqTestimonialsSection({
  title,
  subtitle,
  testimonials,
}: SqTestimonialsSectionProps) {
  return (
    <section className="w-full py-8 md:py-16">
      <H2 className="mb-2 text-center">{title}</H2>
      <P size="md" className="mb-10 text-center text-muted-foreground">
        {subtitle}
      </P>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {testimonials.map((testimonial, index) => (
          <TestimonialCard key={index} {...testimonial} />
        ))}
      </div>
    </section>
  );
}
