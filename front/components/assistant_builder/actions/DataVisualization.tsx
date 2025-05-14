import Link from "next/link";

export function DataVisualization() {
  return (
    <div>
      <p>
        This tool will visualize your data directly within Dust by asking your
        agents to build graphs automatically.
      </p>

      <p>
        Read{" "}
        <Link
          href="https://docs.dust.tt/docs/data-visualization-1"
          className="text-highlight"
          target="_blank"
        >
          our guide
        </Link>{" "}
        to learn more.
      </p>
    </div>
  );
}
