import type { SVGProps } from "react";
import * as React from "react";

const SvgGoogleChrome = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#google-chrome_svg__a)">
      <path
        d="M20.965 12c0-1.04-.179-2.037-.504-2.965H12a1.035 1.035 0 0 1 0-2.07h7.418A8.96 8.96 0 0 0 12 3.035a8.94 8.94 0 0 0-6.798 3.123l4.235 7.324a1.036 1.036 0 0 1-1.793 1.036L3.929 8.093A8.9 8.9 0 0 0 3.035 12c0 4.383 3.146 8.029 7.302 8.809l4.227-7.327a1.036 1.036 0 0 1 1.792 1.036l-3.705 6.42c4.647-.333 8.314-4.206 8.314-8.938m2.07 0c0 6.095-4.94 11.035-11.035 11.035a11 11 0 0 1-1.34-.084C5.196 22.29.964 17.641.964 12c0-2.413.776-4.644 2.09-6.46a1 1 0 0 1 .129-.176A11.02 11.02 0 0 1 12 .964c4.49 0 8.35 2.684 10.073 6.532q.04.074.07.152c.573 1.336.892 2.807.892 4.352"
        opacity={0.4}
      />
      <path d="M14.965 12a2.965 2.965 0 1 0-5.93 0 2.965 2.965 0 0 0 5.93 0m2.07 0a5.035 5.035 0 1 1-10.07 0 5.035 5.035 0 0 1 10.07 0" />
    </g>
    <defs>
      <clipPath id="google-chrome_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGoogleChrome;
