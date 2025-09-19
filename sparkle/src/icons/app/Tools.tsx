import type { SVGProps } from "react";
import * as React from "react";
const SvgTools = (props: SVGProps<SVGSVGElement>) => (
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
      d="M2.5 7a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Zm0 10a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Zm10 0a4.5 4.5 0 1 0 9 0 4.5 4.5 0 0 0-9 0Zm5.025-5.845.278-.636a4.908 4.908 0 0 1 2.496-2.533l.854-.38c.463-.205.463-.878 0-1.083l-.806-.359a4.911 4.911 0 0 1-2.533-2.617l-.285-.688a.57.57 0 0 0-1.058 0l-.285.688a4.911 4.911 0 0 1-2.533 2.617l-.806.359c-.463.205-.463.878 0 1.083l.854.38a4.908 4.908 0 0 1 2.496 2.533l.278.636a.57.57 0 0 0 1.05 0Z"
    />
  </svg>
);
export default SvgTools;
