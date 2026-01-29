import { FAQ } from "@app/components/home/FAQ";

interface FAQSectionConfig {
  title: string;
  items: Array<{
    question: string;
    answer: string;
  }>;
}

interface FAQSectionProps {
  config: FAQSectionConfig;
}

export function FAQSection({ config }: FAQSectionProps) {
  return (
    <section className="py-16">
      <FAQ title={config.title} items={config.items} />
    </section>
  );
}
