import TrustedBy from "@app/components/home/TrustedBy";

interface CompetitiveCustomersSectionProps {
  competitorName: string;
}

export function CompetitiveCustomersSection({
  competitorName,
}: CompetitiveCustomersSectionProps) {
  return (
    <section className="w-full">
      <p className="mb-8 text-center text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
        Their secret sauce? They use Dust instead of {competitorName}
      </p>
      <TrustedBy logoSet="landing" showTitle={false} />
    </section>
  );
}
