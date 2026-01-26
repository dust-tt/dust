import { Dispatch, SetStateAction, RefObject, useLayoutEffect } from 'react';

/** The useBoolean return type. */
type UseBooleanReturn = {
    /** The current boolean state value. */
    value: boolean;
    /** Function to set the boolean state directly. */
    setValue: Dispatch<SetStateAction<boolean>>;
    /** Function to set the boolean state to `true`. */
    setTrue: () => void;
    /** Function to set the boolean state to `false`. */
    setFalse: () => void;
    /** Function to toggle the boolean state. */
    toggle: () => void;
};
/**
 * Custom hook that handles boolean state with useful utility functions.
 * @param {boolean} [defaultValue] - The initial value for the boolean state (default is `false`).
 * @returns {UseBooleanReturn} An object containing the boolean state value and utility functions to manipulate the state.
 * @throws Will throw an error if `defaultValue` is an invalid boolean value.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-boolean)
 * @example
 * ```tsx
 * const { value, setTrue, setFalse, toggle } = useBoolean(true);
 * ```
 */
declare function useBoolean(defaultValue?: boolean): UseBooleanReturn;

/**
 * Custom hook that handles click events anywhere on the document.
 * @param {Function} handler - The function to be called when a click event is detected anywhere on the document.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-click-any-where)
 * @example
 * ```tsx
 * const handleClick = (event) => {
 *   console.log('Document clicked!', event);
 * };
 *
 * // Attach click event handler to document
 * useClickAnywhere(handleClick);
 * ```
 */
declare function useClickAnyWhere(handler: (event: MouseEvent) => void): void;

/**
 * The copied text as `string` or `null` if nothing has been copied yet.
 */
type CopiedValue = string | null;
/**
 * Function to copy text to the clipboard.
 * @param text - The text to copy to the clipboard.
 * @returns {Promise<boolean>} A promise that resolves to `true` if the text was copied successfully, or `false` otherwise.
 */
type CopyFn = (text: string) => Promise<boolean>;
/**
 * Custom hook that copies text to the clipboard using the [`Clipboard API`](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API).
 * @returns {[CopiedValue, CopyFn]} An tuple containing the copied text and a function to copy text to the clipboard.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-copy-to-clipboard)
 * @example
 * ```tsx
 * const [copiedText, copyToClipboard] = useCopyToClipboard();
 * const textToCopy = 'Hello, world!';
 *
 * // Attempt to copy text to the clipboard
 * copyToClipboard(textToCopy)
 *   .then(success => {
 *     if (success) {
 *       console.log(`Text "${textToCopy}" copied to clipboard successfully.`);
 *     } else {
 *       console.error('Failed to copy text to clipboard.');
 *     }
 *   });
 * ```
 */
declare function useCopyToClipboard(): [CopiedValue, CopyFn];

/** The countdown's options. */
type CountdownOptions = {
    /** The countdown's starting number, initial value of the returned number. */
    countStart: number;
    /**
     * The countdown's interval, in milliseconds.
     * @default 1000
     */
    intervalMs?: number;
    /**
     * True if the countdown is increment.
     * @default false
     */
    isIncrement?: boolean;
    /**
     * The countdown's stopping number. Pass `-Infinity` to decrease forever.
     * @default 0
     */
    countStop?: number;
};
/** The countdown's controllers. */
type CountdownControllers = {
    /** Start the countdown. */
    startCountdown: () => void;
    /** Stop the countdown. */
    stopCountdown: () => void;
    /** Reset the countdown. */
    resetCountdown: () => void;
};
/**
 * Custom hook that manages countdown.
 * @param {CountdownOptions} countdownOptions - The countdown's options.
 * @returns {[number, CountdownControllers]} An array containing the countdown's count and its controllers.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-countdown)
 * @example
 * ```tsx
 * const [counter, { start, stop, reset }] = useCountdown({
 *   countStart: 10,
 *   intervalMs: 1000,
 *   isIncrement: false,
 * });
 * ```
 */
declare function useCountdown({ countStart, countStop, intervalMs, isIncrement, }: CountdownOptions): [number, CountdownControllers];

/** The hook return type. */
type UseCounterReturn = {
    /** The current count value. */
    count: number;
    /** Function to increment the counter by 1. */
    increment: () => void;
    /** Function to decrement the counter by 1. */
    decrement: () => void;
    /** Function to reset the counter to its initial value. */
    reset: () => void;
    /** Function to set a specific value to the counter. */
    setCount: Dispatch<SetStateAction<number>>;
};
/**
 * Custom hook that manages a counter with increment, decrement, reset, and setCount functionalities.
 * @param {number} [initialValue] - The initial value for the counter.
 * @returns {UseCounterReturn} An object containing the current count and functions to interact with the counter.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-counter)
 * @example
 * ```tsx
 * const { count, increment, decrement, reset, setCount } = useCounter(5);
 * ```
 */
declare function useCounter(initialValue?: number): UseCounterReturn;

/** The hook options. */
type DarkModeOptions = {
    /**
     * The initial value of the dark mode.
     * @default false
     */
    defaultValue?: boolean;
    /**
     * The key to use in the local storage.
     * @default 'usehooks-ts-dark-mode'
     */
    localStorageKey?: string;
    /**
     * If `true` (default), the hook will initialize reading `localStorage`.
     * In SSR, you should set it to `false`, returning the `defaultValue` or `false` initially.
     * @default true
     */
    initializeWithValue?: boolean;
};
/** The hook return type. */
type DarkModeReturn = {
    /** The current state of the dark mode. */
    isDarkMode: boolean;
    /** Function to toggle the dark mode. */
    toggle: () => void;
    /** Function to enable the dark mode. */
    enable: () => void;
    /** Function to disable the dark mode. */
    disable: () => void;
    /** Function to set a specific value to the dark mode. */
    set: (value: boolean) => void;
};
/**
 * Custom hook that returns the current state of the dark mode.
 * @param {?DarkModeOptions} [options] - The initial value of the dark mode, default `false`.
 * @returns {DarkModeReturn} An object containing the dark mode's state and its controllers.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-dark-mode)
 * @example
 * ```tsx
 * const { isDarkMode, toggle, enable, disable, set } = useDarkMode({ defaultValue: true });
 * ```
 */
declare function useDarkMode(options?: DarkModeOptions): DarkModeReturn;

/** Configuration options for controlling the behavior of the debounced function. */
type DebounceOptions = {
    /**
     * Determines whether the function should be invoked on the leading edge of the timeout.
     * @default false
     */
    leading?: boolean;
    /**
     * Determines whether the function should be invoked on the trailing edge of the timeout.
     * @default false
     */
    trailing?: boolean;
    /**
     * The maximum time the specified function is allowed to be delayed before it is invoked.
     */
    maxWait?: number;
};
/** Functions to manage a debounced callback. */
type ControlFunctions = {
    /** Cancels pending function invocations. */
    cancel: () => void;
    /** Immediately invokes pending function invocations. */
    flush: () => void;
    /**
     * Checks if there are any pending function invocations.
     * @returns `true` if there are pending invocations, otherwise `false`.
     */
    isPending: () => boolean;
};
/**
 * Represents the state and control functions of a debounced callback.
 * Subsequent calls to the debounced function return the result of the last invocation.
 * Note: If there are no previous invocations, the result will be undefined.
 * Ensure proper handling in your code.
 */
type DebouncedState<T extends (...args: any) => ReturnType<T>> = ((...args: Parameters<T>) => ReturnType<T> | undefined) & ControlFunctions;
/**
 * Custom hook that creates a debounced version of a callback function.
 * @template T - Type of the original callback function.
 * @param {T} func - The callback function to be debounced.
 * @param {number} delay - The delay in milliseconds before the callback is invoked (default is `500` milliseconds).
 * @param {DebounceOptions} [options] - Options to control the behavior of the debounced function.
 * @returns {DebouncedState<T>} A debounced version of the original callback along with control functions.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-debounce-callback)
 * @example
 * ```tsx
 * const debouncedCallback = useDebounceCallback(
 *   (searchTerm) => {
 *     // Perform search after user stops typing for 500 milliseconds
 *     searchApi(searchTerm);
 *   },
 *   500
 * );
 *
 * // Later in the component
 * debouncedCallback('react hooks'); // Will invoke the callback after 500 milliseconds of inactivity.
 * ```
 */
declare function useDebounceCallback<T extends (...args: any) => ReturnType<T>>(func: T, delay?: number, options?: DebounceOptions): DebouncedState<T>;

/**
 * Hook options.
 * @template T - The type of the value.
 */
type UseDebounceValueOptions<T> = {
    /**
     * Determines whether the function should be invoked on the leading edge of the timeout.
     * @default false
     */
    leading?: boolean;
    /**
     * Determines whether the function should be invoked on the trailing edge of the timeout.
     * @default false
     */
    trailing?: boolean;
    /**
     * The maximum time the specified function is allowed to be delayed before it is invoked.
     */
    maxWait?: number;
    /** A function to determine if the value has changed. Defaults to a function that checks if the value is strictly equal to the previous value. */
    equalityFn?: (left: T, right: T) => boolean;
};
/**
 * Custom hook that returns a debounced version of the provided value, along with a function to update it.
 * @template T - The type of the value.
 * @param {T | (() => T)} initialValue - The value to be debounced.
 * @param {number} delay - The delay in milliseconds before the value is updated (default is 500ms).
 * @param {object} [options] - Optional configurations for the debouncing behavior.
 * @returns {[T, DebouncedState<(value: T) => void>]} An array containing the debounced value and the function to update it.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-debounce-value)
 * @example
 * ```tsx
 * const [debouncedValue, updateDebouncedValue] = useDebounceValue(inputValue, 500, { leading: true });
 * ```
 */
declare function useDebounceValue<T>(initialValue: T | (() => T), delay: number, options?: UseDebounceValueOptions<T>): [T, DebouncedState<(value: T) => void>];

/** Hook options. */
type UseDocumentTitleOptions = {
    /** Whether to keep the title after unmounting the component (default is `true`). */
    preserveTitleOnUnmount?: boolean;
};
/**
 * Custom hook that sets the document title.
 * @param {string} title - The title to set.
 * @param {?UseDocumentTitleOptions} [options] - The options.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-document-title)
 * @example
 * ```tsx
 * useDocumentTitle('My new title');
 * ```
 */
declare function useDocumentTitle(title: string, options?: UseDocumentTitleOptions): void;

/**
 * Custom hook that creates a memoized event callback.
 * @template Args - An array of argument types for the event callback.
 * @template R - The return type of the event callback.
 * @param {(...args: Args) => R} fn - The callback function.
 * @returns {(...args: Args) => R} A memoized event callback function.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-event-callback)
 * @example
 * ```tsx
 * const handleClick = useEventCallback((event) => {
 *   // Handle the event here
 * });
 * ```
 */
declare function useEventCallback<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;
declare function useEventCallback<Args extends unknown[], R>(fn: ((...args: Args) => R) | undefined): ((...args: Args) => R) | undefined;

declare function useEventListener<K extends keyof MediaQueryListEventMap>(eventName: K, handler: (event: MediaQueryListEventMap[K]) => void, element: RefObject<MediaQueryList>, options?: boolean | AddEventListenerOptions): void;
declare function useEventListener<K extends keyof WindowEventMap>(eventName: K, handler: (event: WindowEventMap[K]) => void, element?: undefined, options?: boolean | AddEventListenerOptions): void;
declare function useEventListener<K extends keyof HTMLElementEventMap & keyof SVGElementEventMap, T extends Element = K extends keyof HTMLElementEventMap ? HTMLDivElement : SVGElement>(eventName: K, handler: ((event: HTMLElementEventMap[K]) => void) | ((event: SVGElementEventMap[K]) => void), element: RefObject<T>, options?: boolean | AddEventListenerOptions): void;
declare function useEventListener<K extends keyof DocumentEventMap>(eventName: K, handler: (event: DocumentEventMap[K]) => void, element: RefObject<Document>, options?: boolean | AddEventListenerOptions): void;

/**
 * Custom hook that tracks whether a DOM element is being hovered over.
 * @template T - The type of the DOM element. Defaults to `HTMLElement`.
 * @param {RefObject<T>} elementRef - The ref object for the DOM element to track.
 * @returns {boolean} A boolean value indicating whether the element is being hovered over.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-hover)
 * @example
 * ```tsx
 * const buttonRef = useRef<HTMLButtonElement>(null);
 * const isHovered = useHover(buttonRef);
 * // Access the isHovered variable to determine if the button is being hovered over.
 * ```
 */
declare function useHover<T extends HTMLElement = HTMLElement>(elementRef: RefObject<T>): boolean;

/** Represents the options for configuring the Intersection Observer. */
type UseIntersectionObserverOptions = {
    /**
     * The element that is used as the viewport for checking visibility of the target.
     * @default null
     */
    root?: Element | Document | null;
    /**
     * A margin around the root.
     * @default '0%'
     */
    rootMargin?: string;
    /**
     * A threshold indicating the percentage of the target's visibility needed to trigger the callback.
     * @default 0
     */
    threshold?: number | number[];
    /**
     * If true, freezes the intersection state once the element becomes visible.
     * @default false
     */
    freezeOnceVisible?: boolean;
    /**
     * A callback function to be invoked when the intersection state changes.
     * @param {boolean} isIntersecting - A boolean indicating if the element is intersecting.
     * @param {IntersectionObserverEntry} entry - The intersection observer Entry.
     * @default undefined
     */
    onChange?: (isIntersecting: boolean, entry: IntersectionObserverEntry) => void;
    /**
     * The initial state of the intersection.
     * @default false
     */
    initialIsIntersecting?: boolean;
};
/**
 * The return type of the useIntersectionObserver hook.
 *
 * Supports both tuple and object destructing.
 * @param {(node: Element | null) => void} ref - The ref callback function.
 * @param {boolean} isIntersecting - A boolean indicating if the element is intersecting.
 * @param {IntersectionObserverEntry | undefined} entry - The intersection observer Entry.
 */
type IntersectionReturn = [
    (node?: Element | null) => void,
    boolean,
    IntersectionObserverEntry | undefined
] & {
    ref: (node?: Element | null) => void;
    isIntersecting: boolean;
    entry?: IntersectionObserverEntry;
};
/**
 * Custom hook that tracks the intersection of a DOM element with its containing element or the viewport using the [`Intersection Observer API`](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
 * @param {UseIntersectionObserverOptions} options - The options for the Intersection Observer.
 * @returns {IntersectionReturn} The ref callback, a boolean indicating if the element is intersecting, and the intersection observer entry.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-intersection-observer)
 * @example
 * ```tsx
 * // Example 1
 * const [ref, isIntersecting, entry] = useIntersectionObserver({ threshold: 0.5 });
 * ```
 *
 * ```tsx
 * // Example 2
 * const { ref, isIntersecting, entry } = useIntersectionObserver({ threshold: 0.5 });
 * ```
 */
declare function useIntersectionObserver({ threshold, root, rootMargin, freezeOnceVisible, initialIsIntersecting, onChange, }?: UseIntersectionObserverOptions): IntersectionReturn;

/**
 * Custom hook that creates an interval that invokes a callback function at a specified delay using the [`setInterval API`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setInterval).
 * @param {() => void} callback - The function to be invoked at each interval.
 * @param {number | null} delay - The time, in milliseconds, between each invocation of the callback. Use `null` to clear the interval.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-interval)
 * @example
 * ```tsx
 * const handleInterval = () => {
 *   // Code to be executed at each interval
 * };
 * useInterval(handleInterval, 1000);
 * ```
 */
declare function useInterval(callback: () => void, delay: number | null): void;

/**
 * Custom hook that determines if the code is running on the client side (in the browser).
 * @returns {boolean} A boolean value indicating whether the code is running on the client side.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-is-client)
 * @example
 * ```tsx
 * const isClient = useIsClient();
 * // Use isClient to conditionally render or execute code specific to the client side.
 * ```
 */
declare function useIsClient(): boolean;

/**
 * Custom hook that determines if the component is currently mounted.
 * @returns {() => boolean} A function that returns a boolean value indicating whether the component is mounted.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-is-mounted)
 * @example
 * ```tsx
 * const isComponentMounted = useIsMounted();
 * // Use isComponentMounted() to check if the component is currently mounted before performing certain actions.
 * ```
 */
declare function useIsMounted(): () => boolean;

/**
 * Custom hook that uses either `useLayoutEffect` or `useEffect` based on the environment (client-side or server-side).
 * @param {Function} effect - The effect function to be executed.
 * @param {Array<any>} [dependencies] - An array of dependencies for the effect (optional).
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-isomorphic-layout-effect)
 * @example
 * ```tsx
 * useIsomorphicLayoutEffect(() => {
 *   // Code to be executed during the layout phase on the client side
 * }, [dependency1, dependency2]);
 * ```
 */
declare const useIsomorphicLayoutEffect: typeof useLayoutEffect;

declare global {
    interface WindowEventMap {
        'local-storage': CustomEvent;
    }
}
/**
 * Options for customizing the behavior of serialization and deserialization.
 * @template T - The type of the state to be stored in local storage.
 */
type UseLocalStorageOptions<T> = {
    /** A function to serialize the value before storing it. */
    serializer?: (value: T) => string;
    /** A function to deserialize the stored value. */
    deserializer?: (value: string) => T;
    /**
     * If `true` (default), the hook will initialize reading the local storage. In SSR, you should set it to `false`, returning the initial value initially.
     * @default true
     */
    initializeWithValue?: boolean;
};
/**
 * Custom hook that uses the [`localStorage API`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) to persist state across page reloads.
 * @template T - The type of the state to be stored in local storage.
 * @param {string} key - The key under which the value will be stored in local storage.
 * @param {T | (() => T)} initialValue - The initial value of the state or a function that returns the initial value.
 * @param {UseLocalStorageOptions<T>} [options] - Options for customizing the behavior of serialization and deserialization (optional).
 * @returns {[T, Dispatch<SetStateAction<T>>, () => void]} A tuple containing the stored value, a function to set the value and a function to remove the key from storage.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-local-storage)
 * @example
 * ```tsx
 * const [count, setCount, removeCount] = useLocalStorage('count', 0);
 * // Access the `count` value, the `setCount` function to update it and `removeCount` function to remove the key from storage.
 * ```
 */
declare function useLocalStorage<T>(key: string, initialValue: T | (() => T), options?: UseLocalStorageOptions<T>): [T, Dispatch<SetStateAction<T>>, () => void];

/**
 * Represents the type for either a Map or an array of key-value pairs.
 * @template K - The type of keys in the map.
 * @template V - The type of values in the map.
 */
type MapOrEntries<K, V> = Map<K, V> | [K, V][];
/**
 * Represents the actions available to interact with the map state.
 * @template K - The type of keys in the map.
 * @template V - The type of values in the map.
 */
type UseMapActions<K, V> = {
    /** Set a key-value pair in the map. */
    set: (key: K, value: V) => void;
    /** Set all key-value pairs in the map. */
    setAll: (entries: MapOrEntries<K, V>) => void;
    /** Remove a key-value pair from the map. */
    remove: (key: K) => void;
    /** Reset the map to an empty state. */
    reset: Map<K, V>['clear'];
};
/**
 * Represents the return type of the `useMap` hook.
 * We hide some setters from the returned map to disable autocompletion.
 * @template K - The type of keys in the map.
 * @template V - The type of values in the map.
 */
type UseMapReturn<K, V> = [
    Omit<Map<K, V>, 'set' | 'clear' | 'delete'>,
    UseMapActions<K, V>
];
/**
 * Custom hook that manages a key-value [`Map`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map) state with setter actions.
 * @template K - The type of keys in the map.
 * @template V - The type of values in the map.
 * @param {MapOrEntries<K, V>} [initialState] - The initial state of the map as a Map or an array of key-value pairs (optional).
 * @returns {UseMapReturn<K, V>} A tuple containing the map state and actions to interact with the map.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-map)
 * @example
 * ```tsx
 * const [map, mapActions] = useMap();
 * // Access the `map` state and use `mapActions` to set, remove, or reset entries.
 * ```
 */
declare function useMap<K, V>(initialState?: MapOrEntries<K, V>): UseMapReturn<K, V>;

/** Hook options. */
type UseMediaQueryOptions = {
    /**
     * The default value to return if the hook is being run on the server.
     * @default false
     */
    defaultValue?: boolean;
    /**
     * If `true` (default), the hook will initialize reading the media query. In SSR, you should set it to `false`, returning `options.defaultValue` or `false` initially.
     * @default true
     */
    initializeWithValue?: boolean;
};
/**
 * Custom hook that tracks the state of a media query using the [`Match Media API`](https://developer.mozilla.org/en-US/docs/Web/API/Window/matchMedia).
 * @param {string} query - The media query to track.
 * @param {?UseMediaQueryOptions} [options] - The options for customizing the behavior of the hook (optional).
 * @returns {boolean} The current state of the media query (true if the query matches, false otherwise).
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-media-query)
 * @example
 * ```tsx
 * const isSmallScreen = useMediaQuery('(max-width: 600px)');
 * // Use `isSmallScreen` to conditionally apply styles or logic based on the screen size.
 * ```
 */
declare function useMediaQuery(query: string, { defaultValue, initializeWithValue, }?: UseMediaQueryOptions): boolean;

/** Supported event types. */
type EventType = 'mousedown' | 'mouseup' | 'touchstart' | 'touchend' | 'focusin' | 'focusout';
/**
 * Custom hook that handles clicks outside a specified element.
 * @template T - The type of the element's reference.
 * @param {RefObject<T> | RefObject<T>[]} ref - The React ref object(s) representing the element(s) to watch for outside clicks.
 * @param {(event: MouseEvent | TouchEvent | FocusEvent) => void} handler - The callback function to be executed when a click outside the element occurs.
 * @param {EventType} [eventType] - The mouse event type to listen for (optional, default is 'mousedown').
 * @param {?AddEventListenerOptions} [eventListenerOptions] - The options object to be passed to the `addEventListener` method (optional).
 * @returns {void}
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-on-click-outside)
 * @example
 * ```tsx
 * const containerRef = useRef(null);
 * useOnClickOutside([containerRef], () => {
 *   // Handle clicks outside the container.
 * });
 * ```
 */
declare function useOnClickOutside<T extends HTMLElement = HTMLElement>(ref: RefObject<T> | RefObject<T>[], handler: (event: MouseEvent | TouchEvent | FocusEvent) => void, eventType?: EventType, eventListenerOptions?: AddEventListenerOptions): void;

/**
 * Represents the type for the options available when reading from local storage.
 * @template T - The type of the stored value.
 */
type Options<T, InitializeWithValue extends boolean | undefined> = {
    /** Custom deserializer function to convert the stored string value to the desired type (optional). */
    deserializer?: (value: string) => T;
    /** If `true` (default), the hook will initialize reading the local storage. In SSR, you should set it to `false`, returning `undefined` initially. */
    initializeWithValue: InitializeWithValue;
};
declare function useReadLocalStorage<T>(key: string, options: Options<T, false>): T | null | undefined;
declare function useReadLocalStorage<T>(key: string, options?: Partial<Options<T, true>>): T | null;

/** The size of the observed element. */
type Size = {
    /** The width of the observed element. */
    width: number | undefined;
    /** The height of the observed element. */
    height: number | undefined;
};
/** The options for the ResizeObserver. */
type UseResizeObserverOptions<T extends HTMLElement = HTMLElement> = {
    /** The ref of the element to observe. */
    ref: RefObject<T>;
    /**
     * When using `onResize`, the hook doesn't re-render on element size changes; it delegates handling to the provided callback.
     * @default undefined
     */
    onResize?: (size: Size) => void;
    /**
     * The box model to use for the ResizeObserver.
     * @default 'content-box'
     */
    box?: 'border-box' | 'content-box' | 'device-pixel-content-box';
};
/**
 * Custom hook that observes the size of an element using the [`ResizeObserver API`](https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver).
 * @template T - The type of the element to observe.
 * @param {UseResizeObserverOptions<T>} options - The options for the ResizeObserver.
 * @returns {Size} - The size of the observed element.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-resize-observer)
 * @example
 * ```tsx
 * const myRef = useRef(null);
 * const { width = 0, height = 0 } = useResizeObserver({
 *   ref: myRef,
 *   box: 'content-box',
 * });
 *
 * <div ref={myRef}>Hello, world!</div>
 * ```
 */
declare function useResizeObserver<T extends HTMLElement = HTMLElement>(options: UseResizeObserverOptions<T>): Size;

/**
 * The hooks options.
 * @template InitializeWithValue - If `true` (default), the hook will initialize reading the screen dimensions. In SSR, you should set it to `false`, returning `undefined` initially.
 */
type UseScreenOptions<InitializeWithValue extends boolean | undefined> = {
    /**
     * If `true` (default), the hook will initialize reading the screen dimensions. In SSR, you should set it to `false`, returning `undefined` initially.
     * @default true
     */
    initializeWithValue: InitializeWithValue;
    /**
     * The delay in milliseconds before the state is updated (disabled by default for retro-compatibility).
     * @default undefined
     */
    debounceDelay?: number;
};
declare function useScreen(options: UseScreenOptions<false>): Screen | undefined;
declare function useScreen(options?: Partial<UseScreenOptions<true>>): Screen;

/** Script loading status. */
type UseScriptStatus = 'idle' | 'loading' | 'ready' | 'error';
/** Hook options. */
type UseScriptOptions = {
    /** If `true`, prevents the script from being loaded (optional). */
    shouldPreventLoad?: boolean;
    /** If `true`, removes the script from the DOM when the component unmounts (optional). */
    removeOnUnmount?: boolean;
    /** Script's `id` (optional). */
    id?: string;
};
/**
 * Custom hook that dynamically loads scripts and tracking their loading status.
 * @param {string | null} src - The source URL of the script to load. Set to `null` or omit to prevent loading (optional).
 * @param {UseScriptOptions} [options] - Additional options for controlling script loading (optional).
 * @returns {UseScriptStatus} The status of the script loading, which can be one of 'idle', 'loading', 'ready', or 'error'.
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-script)
 * @example
 * const scriptStatus = useScript('https://example.com/script.js', { removeOnUnmount: true });
 * // Access the status of the script loading (e.g., 'loading', 'ready', 'error').
 */
declare function useScript(src: string | null, options?: UseScriptOptions): UseScriptStatus;

/** Hook options. */
type UseScrollLockOptions = {
    /**
     * Whether to lock the scroll initially.
     * @default true
     */
    autoLock?: boolean;
    /**
     * The target element to lock the scroll (default is the body element).
     * @default document.body
     */
    lockTarget?: HTMLElement | string;
    /**
     * Whether to prevent width reflow when locking the scroll.
     * @default true
     */
    widthReflow?: boolean;
};
/** Hook return type. */
type UseScrollLockReturn = {
    /** Whether the scroll is locked. */
    isLocked: boolean;
    /** Lock the scroll. */
    lock: () => void;
    /** Unlock the scroll. */
    unlock: () => void;
};
/**
 * A custom hook that locks and unlocks scroll.
 * @param {UseScrollLockOptions} [options] - Options to configure the hook, by default it will lock the scroll automatically.
 * @returns {UseScrollLockReturn} - An object containing the lock and unlock functions.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-scroll-lock)
 * @example
 * ```tsx
 * // Lock the scroll when the modal is mounted, and unlock it when it's unmounted
 * useScrollLock()
 * ```
 * @example
 * ```tsx
 * // Manually lock and unlock the scroll
 * const { lock, unlock } = useScrollLock({ autoLock: false })
 *
 * return (
 *  <div>
 *   <button onClick={lock}>Lock</button>
 *   <button onClick={unlock}>Unlock</button>
 *  </div>
 * )
 * ```
 */
declare function useScrollLock(options?: UseScrollLockOptions): UseScrollLockReturn;

declare global {
    interface WindowEventMap {
        'session-storage': CustomEvent;
    }
}
/**
 * Represents the options for customizing the behavior of serialization and deserialization.
 * @template T - The type of the state to be stored in session storage.
 */
type UseSessionStorageOptions<T> = {
    /** A function to serialize the value before storing it. */
    serializer?: (value: T) => string;
    /** A function to deserialize the stored value. */
    deserializer?: (value: string) => T;
    /**
     * If `true` (default), the hook will initialize reading the session storage. In SSR, you should set it to `false`, returning the initial value initially.
     * @default true
     */
    initializeWithValue?: boolean;
};
/**
 * Custom hook that uses the [`sessionStorage API`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) to persist state across page reloads.
 * @template T - The type of the state to be stored in session storage.
 * @param {string} key - The key under which the value will be stored in session storage.
 * @param {T | (() => T)} initialValue - The initial value of the state or a function that returns the initial value.
 * @param {?UseSessionStorageOptions<T>} [options] - Options for customizing the behavior of serialization and deserialization (optional).
 * @returns {[T, Dispatch<SetStateAction<T>>, () => void]} A tuple containing the stored value, a function to set the value and a function to remove the key from storage.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-session-storage)
 * @example
 * ```tsx
 * const [count, setCount, removeCount] = useSessionStorage('count', 0);
 * // Access the `count` value, the `setCount` function to update it and `removeCount` function to remove the key from storage.
 * ```
 */
declare function useSessionStorage<T>(key: string, initialValue: T | (() => T), options?: UseSessionStorageOptions<T>): [T, Dispatch<SetStateAction<T>>, () => void];

/** Represents the second element of the output of the `useStep` hook. */
type UseStepActions = {
    /** Go to the next step in the process. */
    goToNextStep: () => void;
    /** Go to the previous step in the process. */
    goToPrevStep: () => void;
    /** Reset the step to the initial step. */
    reset: () => void;
    /** Check if the next step is available. */
    canGoToNextStep: boolean;
    /** Check if the previous step is available. */
    canGoToPrevStep: boolean;
    /** Set the current step to a specific value. */
    setStep: Dispatch<SetStateAction<number>>;
};
/**
 * Custom hook that manages and navigates between steps in a multi-step process.
 * @param {number} maxStep - The maximum step in the process.
 * @returns {[number, UseStepActions]} An tuple containing the current step and helper functions for navigating steps.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-step)
 * @example
 * ```tsx
 * const [currentStep, { goToNextStep, goToPrevStep, reset, canGoToNextStep, canGoToPrevStep, setStep }] = useStep(3);
 * // Access and use the current step and provided helper functions.
 * ```
 */
declare function useStep(maxStep: number): [number, UseStepActions];

/** Ternary dark mode options. */
type TernaryDarkMode = 'system' | 'dark' | 'light';
/** Options for the `useTernaryDarkMode` hook. */
type TernaryDarkModeOptions = {
    /**
     * The default value for the dark mode.
     * @default 'system'
     */
    defaultValue?: TernaryDarkMode;
    /**
     * The key for storing dark mode preference in local storage.
     * @default 'usehooks-ts-ternary-dark-mode'
     */
    localStorageKey?: string;
    /**
     * If `true` (default), the hook will initialize reading `localStorage`. In SSR, you should set it to `false`, returning default values initially.
     * @default true
     */
    initializeWithValue?: boolean;
};
/** Represents the return type of the `useTernaryDarkMode` hook. */
type TernaryDarkModeReturn = {
    /** The current state of the dark mode. */
    isDarkMode: boolean;
    /** The current state of the dark mode. */
    ternaryDarkMode: TernaryDarkMode;
    /** A function to set the dark mode state. */
    setTernaryDarkMode: Dispatch<SetStateAction<TernaryDarkMode>>;
    /** A function to toggle the dark mode state. */
    toggleTernaryDarkMode: () => void;
};
/**
 * Custom hook that manages ternary (system, dark, light) dark mode with local storage support.
 * @param {?TernaryDarkModeOptions | string} [options] - Options or the local storage key for the hook.
 * @returns {TernaryDarkModeReturn} An object containing the dark mode state and helper functions.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-ternary-dark-mode)
 * @example
 * ```tsx
 * const { isDarkMode, ternaryDarkMode, setTernaryDarkMode, toggleTernaryDarkMode } = useTernaryDarkMode({ defaultValue: 'dark' });
 * // Access and use the dark mode state and provided helper functions.
 * ```
 */
declare function useTernaryDarkMode({ defaultValue, localStorageKey, initializeWithValue, }?: TernaryDarkModeOptions): TernaryDarkModeReturn;

/**
 * Custom hook that handles timeouts in React components using the [`setTimeout API`](https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/setTimeout).
 * @param {() => void} callback - The function to be executed when the timeout elapses.
 * @param {number | null} delay - The duration (in milliseconds) for the timeout. Set to `null` to clear the timeout.
 * @returns {void} This hook does not return anything.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-timeout)
 * @example
 * ```tsx
 * // Usage of useTimeout hook
 * useTimeout(() => {
 *   // Code to be executed after the specified delay
 * }, 1000); // Set a timeout of 1000 milliseconds (1 second)
 * ```
 */
declare function useTimeout(callback: () => void, delay: number | null): void;

/**
 * Custom hook that manages a boolean toggle state in React components.
 * @param {boolean} [defaultValue] - The initial value for the toggle state.
 * @returns {[boolean, () => void, Dispatch<SetStateAction<boolean>>]} A tuple containing the current state,
 * a function to toggle the state, and a function to set the state explicitly.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-toggle)
 * @example
 * ```tsx
 * const [isToggled, toggle, setToggle] = useToggle(); // Initial value is false
 * // OR
 * const [isToggled, toggle, setToggle] = useToggle(true); // Initial value is true
 * // Use isToggled in your component, toggle to switch the state, setToggle to set the state explicitly.
 * ```
 */
declare function useToggle(defaultValue?: boolean): [boolean, () => void, Dispatch<SetStateAction<boolean>>];

/**
 * Custom hook that runs a cleanup function when the component is unmounted.
 * @param {() => void} func - The cleanup function to be executed on unmount.
 * @public
 * @see [Documentation](https://usehooks-ts.com/react-hook/use-unmount)
 * @example
 * ```tsx
 * useUnmount(() => {
 *   // Cleanup logic here
 * });
 * ```
 */
declare function useUnmount(func: () => void): void;

/**
 * Represent the dimension of the window.
 * @template T - The type of the dimension (number or undefined).
 */
type WindowSize<T extends number | undefined = number | undefined> = {
    /** The width of the window. */
    width: T;
    /** The height of the window. */
    height: T;
};
/**
 * Hook options.
 * @template InitializeWithValue - If `true` (default), the hook will initialize reading the window size. In SSR, you should set it to `false`, returning `undefined` initially.
 */
type UseWindowSizeOptions<InitializeWithValue extends boolean | undefined> = {
    /**
     * If `true` (default), the hook will initialize reading the window size. In SSR, you should set it to `false`, returning `undefined` initially.
     * @default true
     */
    initializeWithValue: InitializeWithValue;
    /**
     * The delay in milliseconds before the state is updated (disabled by default for retro-compatibility).
     * @default undefined
     */
    debounceDelay?: number;
};
declare function useWindowSize(options: UseWindowSizeOptions<false>): WindowSize;
declare function useWindowSize(options?: Partial<UseWindowSizeOptions<true>>): WindowSize<number>;

export { type DebouncedState, type TernaryDarkMode, type TernaryDarkModeOptions, type TernaryDarkModeReturn, useBoolean, useClickAnyWhere, useCopyToClipboard, useCountdown, useCounter, useDarkMode, useDebounceCallback, useDebounceValue, useDocumentTitle, useEventCallback, useEventListener, useHover, useIntersectionObserver, useInterval, useIsClient, useIsMounted, useIsomorphicLayoutEffect, useLocalStorage, useMap, useMediaQuery, useOnClickOutside, useReadLocalStorage, useResizeObserver, useScreen, useScript, useScrollLock, useSessionStorage, useStep, useTernaryDarkMode, useTimeout, useToggle, useUnmount, useWindowSize };
