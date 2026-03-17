import type { SVGProps } from "react";
import * as React from "react";

// Hex Technologies (hex.tech) — official logo (Hex Pink for dark backgrounds)
const SvgHex = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width="24" height="24" rx="4" fill="#000000" />
    <g transform="translate(2, 7.9) scale(0.0138)">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M250.11 0V199.49H200.11V0H0V199.63V200.19V399.81V600H200.11V299.31H250.11V600H450.29V0H250.11ZM500.01 0V600H950.3V349.77H750.1V498.77H700.1V299.31H950.3V0H500.01ZM700.1 199.49V100H750.1V199.49H700.1ZM1250.12 199.49V0H1450.3V150L1350.3 250.09L1450.3 350.18V600H1250.12V299.31H1200.12V600H1000.01V350.18L1100.12 250.09L1000.01 150V0H1200.12V199.49H1250.12Z"
        fill="#F5C0C0"
      />
    </g>
  </svg>
);

export default SvgHex;
