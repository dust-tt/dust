import type { SVGProps } from "react";
import * as React from "react";

const SvgShapesPlus = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      stroke="currentColor"
      strokeWidth={2}
      d="M6.143 3.158a.5.5 0 0 1 .707 0l3.004 3.004a.5.5 0 0 1 0 .707L6.85 9.873a.5.5 0 0 1-.707 0L3.139 6.87a.5.5 0 0 1 0-.707z"
    />
    <circle
      cx={17.866}
      cy={6.481}
      r={3.134}
      stroke="currentColor"
      strokeWidth={2}
    />
    <rect
      width={6.312}
      height={6.294}
      x={3.009}
      y={14.698}
      stroke="currentColor"
      strokeWidth={2}
      rx={2}
    />
    <rect
      width={8.685}
      height={1.911}
      x={13.315}
      y={16.693}
      fill="currentColor"
      rx={0.956}
    />
    <rect
      width={8.686}
      height={1.911}
      x={18.677}
      y={13.306}
      fill="currentColor"
      rx={0.955}
      transform="rotate(90 18.677 13.306)"
    />
  </svg>
);
export default SvgShapesPlus;
