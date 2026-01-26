import React from "react";
import { LayoutPriority } from "./split-view";
export interface CommonProps {
    /** Sets a className attribute on the outer component */
    className?: string;
    /** Maximum size of each element */
    maxSize?: number;
    /** Minimum size of each element */
    minSize?: number;
    /** Enable snap to zero size */
    snap?: boolean;
}
export type PaneProps = {
    children: React.ReactNode;
    /**
     * Preferred size of this pane. Allotment will attempt to use this size when adding this pane (including on initial mount) as well as when a user double clicks a sash, or the `reset` method is called on the Allotment instance.
     * @remarks The size can either be a number or a string. If it is a number it will be interpreted as a number of pixels. If it is a string it should end in either "px" or "%". If it ends in "px" it will be interpreted as a number of pixels, e.g. "120px". If it ends in "%" it will be interpreted as a percentage of the size of the Allotment component, e.g. "50%".
     */
    preferredSize?: number | string;
    /**
     * The priority of the pane when the layout algorithm runs. Panes with higher priority will be resized first.
     * @remarks Only used when `proportionalLayout` is false.
     */
    priority?: LayoutPriority;
    /** Whether the pane should be visible */
    visible?: boolean;
} & CommonProps;
/**
 * Pane component.
 */
export declare const Pane: React.ForwardRefExoticComponent<{
    children: React.ReactNode;
    /**
     * Preferred size of this pane. Allotment will attempt to use this size when adding this pane (including on initial mount) as well as when a user double clicks a sash, or the `reset` method is called on the Allotment instance.
     * @remarks The size can either be a number or a string. If it is a number it will be interpreted as a number of pixels. If it is a string it should end in either "px" or "%". If it ends in "px" it will be interpreted as a number of pixels, e.g. "120px". If it ends in "%" it will be interpreted as a percentage of the size of the Allotment component, e.g. "50%".
     */
    preferredSize?: number | string;
    /**
     * The priority of the pane when the layout algorithm runs. Panes with higher priority will be resized first.
     * @remarks Only used when `proportionalLayout` is false.
     */
    priority?: LayoutPriority;
    /** Whether the pane should be visible */
    visible?: boolean;
} & CommonProps & React.RefAttributes<HTMLDivElement>>;
export type AllotmentHandle = {
    reset: () => void;
    resize: (sizes: number[]) => void;
};
export type AllotmentProps = {
    children: React.ReactNode;
    /** Initial size of each element */
    defaultSizes?: number[];
    /** The id to set on the SplitView component. */
    id?: string;
    /** Resize each view proportionally when resizing container */
    proportionalLayout?: boolean;
    /** Whether to render a separator between panes */
    separator?: boolean;
    /**
     * Initial size of each element
     * @deprecated Use {@link AllotmentProps.defaultSizes defaultSizes} instead
     */
    sizes?: number[];
    /** Direction to split */
    vertical?: boolean;
    /** Callback on drag */
    onChange?: (sizes: number[]) => void;
    /** Callback on reset */
    onReset?: () => void;
    /** Callback on visibility change */
    onVisibleChange?: (index: number, visible: boolean) => void;
    /** Callback on drag start */
    onDragStart?: (sizes: number[]) => void;
    /** Callback on drag end */
    onDragEnd?: (sizes: number[]) => void;
} & CommonProps;
/**
 * Set sash size. This is set in both css and js and this function keeps the two in sync.
 *
 * @param sashSize Sash size in pixels
 */
export declare function setSashSize(sashSize: number): void;
declare const _default: React.ForwardRefExoticComponent<{
    children: React.ReactNode;
    /** Initial size of each element */
    defaultSizes?: number[];
    /** The id to set on the SplitView component. */
    id?: string;
    /** Resize each view proportionally when resizing container */
    proportionalLayout?: boolean;
    /** Whether to render a separator between panes */
    separator?: boolean;
    /**
     * Initial size of each element
     * @deprecated Use {@link AllotmentProps.defaultSizes defaultSizes} instead
     */
    sizes?: number[];
    /** Direction to split */
    vertical?: boolean;
    /** Callback on drag */
    onChange?: (sizes: number[]) => void;
    /** Callback on reset */
    onReset?: () => void;
    /** Callback on visibility change */
    onVisibleChange?: (index: number, visible: boolean) => void;
    /** Callback on drag start */
    onDragStart?: (sizes: number[]) => void;
    /** Callback on drag end */
    onDragEnd?: (sizes: number[]) => void;
} & CommonProps & React.RefAttributes<AllotmentHandle>> & {
    Pane: React.ForwardRefExoticComponent<{
        children: React.ReactNode;
        /**
         * Preferred size of this pane. Allotment will attempt to use this size when adding this pane (including on initial mount) as well as when a user double clicks a sash, or the `reset` method is called on the Allotment instance.
         * @remarks The size can either be a number or a string. If it is a number it will be interpreted as a number of pixels. If it is a string it should end in either "px" or "%". If it ends in "px" it will be interpreted as a number of pixels, e.g. "120px". If it ends in "%" it will be interpreted as a percentage of the size of the Allotment component, e.g. "50%".
         */
        preferredSize?: number | string;
        /**
         * The priority of the pane when the layout algorithm runs. Panes with higher priority will be resized first.
         * @remarks Only used when `proportionalLayout` is false.
         */
        priority?: LayoutPriority;
        /** Whether the pane should be visible */
        visible?: boolean;
    } & CommonProps & React.RefAttributes<HTMLDivElement>>;
};
export default _default;
//# sourceMappingURL=allotment.d.ts.map