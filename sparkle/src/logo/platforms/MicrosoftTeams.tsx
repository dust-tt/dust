import type { SVGProps } from "react";
import * as React from "react";
const SvgMicrosoftTeams = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#5059C9"
      d="M16.345 9.5h5.683c.537 0 .972.425.972.95v5.059C23 17.436 21.4 19 19.427 19h-.017c-1.973 0-3.572-1.563-3.573-3.491V9.995c0-.274.228-.496.508-.496ZM20.186 8.5c1.272 0 2.302-1.007 2.302-2.25S21.458 4 20.186 4c-1.271 0-2.302 1.007-2.302 2.25s1.03 2.25 2.302 2.25Z"
    />
    <path
      fill="#7B83EB"
      d="M13.023 8.5c1.837 0 3.326-1.455 3.326-3.25S14.859 2 13.023 2 9.698 3.455 9.698 5.25s1.489 3.25 3.325 3.25ZM17.457 9.5h-9.38a.95.95 0 0 0-.937.961v5.77c-.075 3.111 2.444 5.693 5.627 5.769 3.184-.076 5.702-2.658 5.628-5.769v-5.77a.95.95 0 0 0-.938-.961Z"
    />
    <rect
      width={11}
      height={10}
      x={1}
      y={7}
      fill="url(#MicrosoftTeams_svg__a)"
      rx={1}
    />
    <path fill="#fff" d="M9 10H7.1v5H5.9v-5L4 9.989V9h5v1Z" />
    <defs>
      <linearGradient
        id="MicrosoftTeams_svg__a"
        x1={2.911}
        x2={9.112}
        y1={6.349}
        y2={18.164}
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="#5A62C3" />
        <stop offset={0.5} stopColor="#4D55BD" />
        <stop offset={1} stopColor="#3940AB" />
      </linearGradient>
    </defs>
  </svg>
);
export default SvgMicrosoftTeams;
