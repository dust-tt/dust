import EventEmitter from "eventemitter3";
import { Disposable } from "../helpers/disposable";
import { Orientation } from "../sash";
/**
 * When adding or removing views, distribute the delta space among
 * all other views.
 */
export type DistributeSizing = {
    type: "distribute";
};
/**
 * When adding or removing views, split the delta space with another
 * specific view, indexed by the provided `index`.
 */
export type SplitSizing = {
    type: "split";
    index: number;
};
/**
 * When adding or removing views, assume the view is invisible.
 */
export type InvisibleSizing = {
    type: "invisible";
    cachedVisibleSize: number;
};
/**
 * When adding or removing views, the sizing provides fine grained
 * control over how other views get resized.
 */
export type Sizing = DistributeSizing | SplitSizing | InvisibleSizing;
export declare namespace Sizing {
    /**
     * When adding or removing views, distribute the delta space among
     * all other views.
     */
    const Distribute: DistributeSizing;
    /**
     * When adding or removing views, split the delta space with another
     * specific view, indexed by the provided `index`.
     */
    function Split(index: number): SplitSizing;
    /**
     * When adding or removing views, assume the view is invisible.
     */
    function Invisible(cachedVisibleSize: number): InvisibleSizing;
}
/** A descriptor for a {@link SplitView} instance. */
export interface SplitViewDescriptor {
    /** The layout size of the {@link SplitView}. */
    size: number;
    /**
     * Descriptors for each {@link View view}.
     */
    views: {
        /** Whether the {@link View view} is visible. */
        visible?: boolean;
        /** The size of the {@link View view}. */
        size: number;
        container: HTMLElement;
        view: View;
    }[];
}
export interface SplitViewOptions {
    /** Which axis the views align on. */
    readonly orientation?: Orientation;
    /** Resize each view proportionally when resizing the SplitView. */
    readonly proportionalLayout?: boolean;
    /**
     * An initial description of this {@link SplitView} instance, allowing
     * to initialize all views within the ctor.
     */
    readonly descriptor?: SplitViewDescriptor;
    /** Override the orthogonal size of sashes. */
    readonly getSashOrthogonalSize?: () => number;
}
export declare enum LayoutPriority {
    Normal = "NORMAL",
    Low = "LOW",
    High = "HIGH"
}
/**
 * The interface to implement for views within a {@link SplitView}.
 */
export interface View {
    /** The DOM element for this view. */
    readonly element: HTMLElement;
    /**
     * A minimum size for this view.
     *
     * @remarks If none, set it to `0`.
     */
    readonly minimumSize: number;
    /**
     * A minimum size for this view.
     *
     * @remarks If none, set it to `Number.POSITIVE_INFINITY`.
     */
    readonly maximumSize: number;
    /**
     * The priority of the view when the {@link SplitView.resize layout} algorithm
     * runs. Views with higher priority will be resized first.
     *
     * @remarks Only used when `proportionalLayout` is false.
     */
    readonly priority?: LayoutPriority;
    /**
     * Whether the view will snap whenever the user reaches its minimum size or
     * attempts to grow it beyond the minimum size.
     */
    readonly snap?: boolean;
    /**
     * This will be called by the {@link SplitView} during layout. A view meant to
     * pass along the layout information down to its descendants.
     *
     * @param size The size of this view, in pixels.
     * @param offset The offset of this view, relative to the start of the {@link SplitView}.
     */
    layout(size: number, offset: number): void;
    /**
     * This will be called by the {@link SplitView} whenever this view is made
     * visible or hidden.
     *
     * @param visible Whether the view becomes visible.
     */
    setVisible?(visible: boolean): void;
}
/**
 * The {@link SplitView} is the UI component which implements a one dimensional
 * flex-like layout algorithm for a collection of {@link View} instances, which
 * are essentially HTMLElement instances with the following size constraints:
 *
 * - {@link View.minimumSize}
 * - {@link View.maximumSize}
 * - {@link View.snap}
 *
 * In case the SplitView doesn't have enough size to fit all views, it will overflow
 * its content with a scrollbar.
 *
 * In between each pair of views there will be a {@link Sash} allowing the user
 * to resize the views, making sure the constraints are respected.
 */
export declare class SplitView extends EventEmitter implements Disposable {
    onDidChange: ((sizes: number[]) => void) | undefined;
    onDidDragStart: ((sizes: number[]) => void) | undefined;
    onDidDragEnd: ((sizes: number[]) => void) | undefined;
    /**  This {@link SplitView}'s orientation. */
    readonly orientation: Orientation;
    private sashContainer;
    private size;
    private contentSize;
    private proportions;
    private viewItems;
    private sashItems;
    private sashDragState;
    private proportionalLayout;
    private readonly getSashOrthogonalSize;
    private _startSnappingEnabled;
    get startSnappingEnabled(): boolean;
    /**
     * Enable/disable snapping at the beginning of this {@link SplitView}.
     */
    set startSnappingEnabled(startSnappingEnabled: boolean);
    private _endSnappingEnabled;
    get endSnappingEnabled(): boolean;
    /**
     * Enable/disable snapping at the end of this {@link SplitView}.
     */
    set endSnappingEnabled(endSnappingEnabled: boolean);
    /** Create a new {@link SplitView} instance. */
    constructor(container: HTMLElement, options?: SplitViewOptions, onDidChange?: (sizes: number[]) => void, onDidDragStart?: (sizes: number[]) => void, onDidDragEnd?: (sizes: number[]) => void);
    /**
     * Add a {@link View view} to this {@link SplitView}.
     *
     * @param container The container element.
     * @param view The view to add.
     * @param size Either a fixed size, or a dynamic {@link Sizing} strategy.
     * @param index The index to insert the view on.
     * @param skipLayout Whether layout should be skipped.
     */
    addView(container: HTMLElement, view: View, size: number | Sizing, index?: number, skipLayout?: boolean): void;
    /**
     * Remove a {@link View view} from this {@link SplitView}.
     *
     * @param index The index where the {@link View view} is located.
     * @param sizing Whether to distribute other {@link View view}'s sizes.
     */
    removeView(index: number, sizing?: Sizing): View;
    /**
     * Move a {@link View view} to a different index.
     *
     * @param from The source index.
     * @param to The target index.
     */
    moveView(container: HTMLElement, from: number, to: number): void;
    /**
     * Returns the {@link View view}'s size previously to being hidden.
     *
     * @param index The {@link View view} index.
     */
    private getViewCachedVisibleSize;
    /**
     * Layout the {@link SplitView}.
     *
     * @param size The entire size of the {@link SplitView}.
     */
    layout(size?: number): void;
    /**
     * Resize a {@link View view} within the {@link SplitView}.
     *
     * @param index The {@link View view} index.
     * @param size The {@link View view} size.
     */
    resizeView(index: number, size: number): void;
    resizeViews(sizes: number[]): void;
    /**
     * Returns the size of a {@link View view}.
     */
    getViewSize(index: number): number;
    /**
     * Returns whether the {@link View view} is visible.
     *
     * @param index The {@link View view} index.
     */
    isViewVisible(index: number): boolean;
    /**
     * Set a {@link View view}'s visibility.
     *
     * @param index The {@link View view} index.
     * @param visible Whether the {@link View view} should be visible.
     */
    setViewVisible(index: number, visible: boolean): void;
    /**
     * Distribute the entire {@link SplitView} size among all {@link View views}.
     */
    distributeViewSizes(): void;
    dispose(): void;
    private relayout;
    private onSashStart;
    private onSashChange;
    private onSashEnd;
    private getSashPosition;
    private resize;
    private distributeEmptySpace;
    private layoutViews;
    private saveProportions;
    private updateSashEnablement;
    private findFirstSnapIndex;
}
//# sourceMappingURL=split-view.d.ts.map