import type { SVGProps } from "react";
import * as React from "react";
const SvgPieChart = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M9 2.458v2.124A8.003 8.003 0 0 0 12 20a8.003 8.003 0 0 0 7.419-5h2.123c-1.274 4.057-5.064 7-9.542 7-5.523 0-10-4.477-10-10 0-4.478 2.943-8.268 7-9.542ZM12 2c5.523 0 10 4.477 10 10 0 .338-.017.671-.05 1H11V2.05c.329-.033.662-.05 1-.05Zm1 2.062V11h6.938A8.004 8.004 0 0 0 13 4.062Z"
    />
  </svg>
);
export default SvgPieChart;
