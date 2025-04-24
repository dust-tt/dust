import { DotIcon, PlusIcon, SparklesIcon, classNames } from "@dust-tt/sparkle";
import { initPlasmicLoader } from "@plasmicapp/loader-nextjs";
import dynamic from "next/dynamic";
import { cloneElement } from "react";

export const PLASMIC = initPlasmicLoader({
  projects: [
    {
      id: "mcmG8carEVNij3XdD8UbJn", // ID of a project you are using
      token:
        "JFg9J0OkHFCqoERB2GRZ07tBDf9gni2MJtrrJhw17vrak28Pn4VAWCl8gjHnW47eet5if2df9UGJYHEKA8rXQ", // API token for that project
    },
  ],
  // Fetches the latest revisions, whether or not they were unpublished!
  // Disable for production to ensure you render only published changes.
  preview: true,
});

const ICONS = [DotIcon, PlusIcon, SparklesIcon];

for (const icon of ICONS) {
  PLASMIC.registerComponent(icon, {
    name: icon.name,
    parentComponentName: "Icon",
    props: {},
  });
}

const IconSizes = {
  xs: "s-h-4 s-w-4",
  sm: "s-h-5 s-w-5",
  md: "s-h-6 s-w-6",
  lg: "s-h-8 s-w-8",
  xl: "s-h-12 s-w-12",
  "2xl": "s-h-20 s-w-20",
};
const Icon = ({
  children,
  size,
  className = "",
}: {
  children: React.ReactElement;
  size: "xs" | "sm" | "md" | "lg";
  className?: string;
}) => {
  return cloneElement(children, {
    className: classNames(className, IconSizes[size]),
  });
};

PLASMIC.registerComponent(Icon, {
  name: "Icon",
  props: {
    size: {
      type: "choice",
      options: ["xl", "xs", "sm", "md"],
      defaultValue: "md",
    },
    children: {
      type: "slot",
      mergeWithParent: true,
      defaultValue: {
        type: "component",
        name: "SvgPlus",
      },
    },
  },
});

PLASMIC.registerComponent(
  dynamic(() => import("@dust-tt/sparkle").then((mod) => mod.Button)),
  {
    name: "Button",
    styleSections: false,
    props: {
      label: {
        type: "string",
        defaultValue: "Button",
        hidden: (props) => props.size === "mini",
      },
      isLoading: "boolean",
      isCounter: "boolean",
      tooltip: "string",
      size: {
        type: "choice",
        options: ["mini", "xs", "sm", "md", "lg", "xl"],
      },
      variant: {
        type: "choice",
        options: ["primary", "outline", "ghost", "ghost-secondary"],
      },
      icon: {
        type: "slot",
        allowedComponents: ICONS.map((icon) => icon.name),
        defaultValue: undefined,
        renderPropParams: ["className"],
        mergeWithParent: true,
        hidePlaceholder: true,
      },
      counterValue: {
        type: "number",
        hidden: (props) => (props.isCounter != null ? !props.isCounter : true),
        defaultValue: 1,
      },
    },
  }
);

PLASMIC.registerComponent(
  dynamic(() => import("@dust-tt/sparkle").then((mod) => mod.Div3D)),
  {
    name: "Div3D",
    parentComponentName: "Hover3D",
    isAttachment: true,
    props: {
      depth: "number",
      children: "slot",
    },
  }
);

PLASMIC.registerComponent(
  dynamic(() => import("@dust-tt/sparkle").then((mod) => mod.Hover3D)),
  {
    name: "Hover3D",
    isAttachment: true,
    props: {
      depth: "number",
      perspective: "number",
      fullscreenSensible: "boolean",
      children: {
        type: "slot",
        allowedComponents: ["Div3D"],
      },
    },
  }
);

PLASMIC.registerComponent(
  dynamic(() => import("@dust-tt/sparkle").then((mod) => mod.Avatar)),
  {
    name: "Avatar",
    props: {
      name: "string",
      size: {
        type: "choice",
        options: ["xs", "sm", "md", "lg", "xl"],
        defaultValue: "md",
      },
      disabled: "boolean",
      busy: "boolean",
      isPulsing: "boolean",
      isRounded: "boolean",
      emoji: "string",
      backgroundColor: "string",
      visual: {
        type: "slot",
        hidden: (props) => props.icon != null,
        defaultValue: undefined,
        hidePlaceholder: true,
      },
      icon: {
        type: "slot",
        hidden: (props) => props.visual != null,
        defaultValue: undefined,
        hidePlaceholder: true,
      },
    },
  }
);

PLASMIC.registerComponent(
  dynamic(() =>
    import("@app/components/home/ContentBlocks").then((mod) => mod.ImgBlock)
  ),
  {
    name: "ImgBlock",
    defaultStyles: {
      width: "100%",
    },
    props: {
      title: {
        type: "string",
        defaultValue: "Lorem Ipsum",
      },
      content: {
        type: "string",
        defaultValue: "Lorem ipsum",
      },
      children: "slot",
    },
  }
);
