import { MetricSection } from "../../ContentBlocks";

const METRICS = {
  metrics: [
    {
      value: "90%",
      description: <>weekly active users</>,
      logo: "/static/landing/logos/alan.png",
    },
    {
      value: "50,000",
      description: <>hours saved annually</>,
      logo: "/static/landing/logos/qonto.png",
    },
    {
      value: "36x",
      description: <>faster at answering tickets</>,
      logo: "/static/landing/logos/malt.png",
    },
    {
      value: "50%",
      description: <>time saved in legal tasks</>,
      logo: "/static/landing/logos/didomi.png",
    },
  ],
};

export function MetricsSection() {
  return (
    <div className="w-full">
      <div className="flex flex-col gap-16">
        <MetricSection {...METRICS}></MetricSection>
      </div>
    </div>
  );
}
