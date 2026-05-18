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
    <g clipPath="url(#google-chrome_svg__a)">
      <path
        fill="currentColor"
        d="M14.965 12a2.965 2.965 0 1 0-5.596 1.365l.068.117.01.02a2.96 2.96 0 0 0 5.08.044l.037-.064.029-.045A2.95 2.95 0 0 0 14.965 12M12 3.035a8.94 8.94 0 0 0-6.798 3.123l2.195 3.798A5.04 5.04 0 0 1 12 6.965h7.418A8.96 8.96 0 0 0 12 3.035M3.035 12c0 4.383 3.146 8.029 7.302 8.809l2.193-3.803q-.26.029-.53.03a5.03 5.03 0 0 1-4.453-2.685L3.929 8.093A8.9 8.9 0 0 0 3.035 12m14 0c0 .975-.28 1.883-.759 2.654l-3.625 6.285c4.647-.334 8.314-4.207 8.314-8.939 0-1.04-.179-2.037-.504-2.965h-4.392c.607.832.966 1.857.966 2.965m6 0c0 6.095-4.94 11.035-11.035 11.035a11 11 0 0 1-1.34-.084C5.196 22.29.964 17.641.964 12c0-2.413.776-4.644 2.09-6.46a1 1 0 0 1 .129-.176A11.02 11.02 0 0 1 12 .964c4.49 0 8.35 2.684 10.073 6.532q.04.074.07.152c.573 1.336.892 2.807.892 4.352"
      />
    </g>
    <defs>
      <clipPath id="google-chrome_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGoogleChrome;
