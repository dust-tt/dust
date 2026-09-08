import type { SVGProps } from "react";
import * as React from "react";

const SvgGmail = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#4285F4"
      d="M2.5 20.255H6v-8.5l-5-3.75v10.75c0 .83.673 1.5 1.5 1.5"
    />
    <path
      fill="#34A853"
      d="M18 20.255h3.5a1.5 1.5 0 0 0 1.5-1.5V8.005l-5 3.75"
    />
    <path
      fill="#FBBC04"
      d="M18 5.254v6.5l5-3.75v-2c0-1.855-2.117-2.912-3.6-1.8"
    />
    <path fill="#EA4335" d="M6 11.755v-6.5l6 4.5 6-4.5v6.5l-6 4.5" />
    <path
      fill="#C5221F"
      d="M1 6.004v2l5 3.75v-6.5l-1.4-1.05C3.115 3.092 1 4.15 1 6.004"
    />
  </svg>
);
export default SvgGmail;
