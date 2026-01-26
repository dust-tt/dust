'use strict';

var react = require('react');
var debounce = require('lodash.debounce');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

var debounce__default = /*#__PURE__*/_interopDefault(debounce);

// src/useBoolean/useBoolean.ts
function useBoolean(defaultValue = false) {
  if (typeof defaultValue !== "boolean") {
    throw new Error("defaultValue must be `true` or `false`");
  }
  const [value, setValue] = react.useState(defaultValue);
  const setTrue = react.useCallback(() => {
    setValue(true);
  }, []);
  const setFalse = react.useCallback(() => {
    setValue(false);
  }, []);
  const toggle = react.useCallback(() => {
    setValue((x) => !x);
  }, []);
  return { value, setValue, setTrue, setFalse, toggle };
}
var useIsomorphicLayoutEffect = typeof window !== "undefined" ? react.useLayoutEffect : react.useEffect;

// src/useEventListener/useEventListener.ts
function useEventListener(eventName, handler, element, options) {
  const savedHandler = react.useRef(handler);
  useIsomorphicLayoutEffect(() => {
    savedHandler.current = handler;
  }, [handler]);
  react.useEffect(() => {
    const targetElement = (element == null ? void 0 : element.current) ?? window;
    if (!(targetElement && targetElement.addEventListener))
      return;
    const listener = (event) => {
      savedHandler.current(event);
    };
    targetElement.addEventListener(eventName, listener, options);
    return () => {
      targetElement.removeEventListener(eventName, listener, options);
    };
  }, [eventName, element, options]);
}

// src/useClickAnyWhere/useClickAnyWhere.ts
function useClickAnyWhere(handler) {
  useEventListener("click", (event) => {
    handler(event);
  });
}
function useCopyToClipboard() {
  const [copiedText, setCopiedText] = react.useState(null);
  const copy = react.useCallback(async (text) => {
    if (!(navigator == null ? void 0 : navigator.clipboard)) {
      console.warn("Clipboard not supported");
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      return true;
    } catch (error) {
      console.warn("Copy failed", error);
      setCopiedText(null);
      return false;
    }
  }, []);
  return [copiedText, copy];
}
function useCounter(initialValue) {
  const [count, setCount] = react.useState(initialValue ?? 0);
  const increment = react.useCallback(() => {
    setCount((x) => x + 1);
  }, []);
  const decrement = react.useCallback(() => {
    setCount((x) => x - 1);
  }, []);
  const reset = react.useCallback(() => {
    setCount(initialValue ?? 0);
  }, [initialValue]);
  return {
    count,
    increment,
    decrement,
    reset,
    setCount
  };
}
function useInterval(callback, delay) {
  const savedCallback = react.useRef(callback);
  useIsomorphicLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  react.useEffect(() => {
    if (delay === null) {
      return;
    }
    const id = setInterval(() => {
      savedCallback.current();
    }, delay);
    return () => {
      clearInterval(id);
    };
  }, [delay]);
}

// src/useCountdown/useCountdown.ts
function useCountdown({
  countStart,
  countStop = 0,
  intervalMs = 1e3,
  isIncrement = false
}) {
  const {
    count,
    increment,
    decrement,
    reset: resetCounter
  } = useCounter(countStart);
  const {
    value: isCountdownRunning,
    setTrue: startCountdown,
    setFalse: stopCountdown
  } = useBoolean(false);
  const resetCountdown = react.useCallback(() => {
    stopCountdown();
    resetCounter();
  }, [stopCountdown, resetCounter]);
  const countdownCallback = react.useCallback(() => {
    if (count === countStop) {
      stopCountdown();
      return;
    }
    if (isIncrement) {
      increment();
    } else {
      decrement();
    }
  }, [count, countStop, decrement, increment, isIncrement, stopCountdown]);
  useInterval(countdownCallback, isCountdownRunning ? intervalMs : null);
  return [count, { startCountdown, stopCountdown, resetCountdown }];
}
function useEventCallback(fn) {
  const ref = react.useRef(() => {
    throw new Error("Cannot call an event handler while rendering.");
  });
  useIsomorphicLayoutEffect(() => {
    ref.current = fn;
  }, [fn]);
  return react.useCallback((...args) => {
    var _a;
    return (_a = ref.current) == null ? void 0 : _a.call(ref, ...args);
  }, [ref]);
}

// src/useLocalStorage/useLocalStorage.ts
var IS_SERVER = typeof window === "undefined";
function useLocalStorage(key, initialValue, options = {}) {
  const { initializeWithValue = true } = options;
  const serializer = react.useCallback(
    (value) => {
      if (options.serializer) {
        return options.serializer(value);
      }
      return JSON.stringify(value);
    },
    [options]
  );
  const deserializer = react.useCallback(
    (value) => {
      if (options.deserializer) {
        return options.deserializer(value);
      }
      if (value === "undefined") {
        return void 0;
      }
      const defaultValue = initialValue instanceof Function ? initialValue() : initialValue;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return defaultValue;
      }
      return parsed;
    },
    [options, initialValue]
  );
  const readValue = react.useCallback(() => {
    const initialValueToUse = initialValue instanceof Function ? initialValue() : initialValue;
    if (IS_SERVER) {
      return initialValueToUse;
    }
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? deserializer(raw) : initialValueToUse;
    } catch (error) {
      console.warn(`Error reading localStorage key \u201C${key}\u201D:`, error);
      return initialValueToUse;
    }
  }, [initialValue, key, deserializer]);
  const [storedValue, setStoredValue] = react.useState(() => {
    if (initializeWithValue) {
      return readValue();
    }
    return initialValue instanceof Function ? initialValue() : initialValue;
  });
  const setValue = useEventCallback((value) => {
    if (IS_SERVER) {
      console.warn(
        `Tried setting localStorage key \u201C${key}\u201D even though environment is not a client`
      );
    }
    try {
      const newValue = value instanceof Function ? value(readValue()) : value;
      window.localStorage.setItem(key, serializer(newValue));
      setStoredValue(newValue);
      window.dispatchEvent(new StorageEvent("local-storage", { key }));
    } catch (error) {
      console.warn(`Error setting localStorage key \u201C${key}\u201D:`, error);
    }
  });
  const removeValue = useEventCallback(() => {
    if (IS_SERVER) {
      console.warn(
        `Tried removing localStorage key \u201C${key}\u201D even though environment is not a client`
      );
    }
    const defaultValue = initialValue instanceof Function ? initialValue() : initialValue;
    window.localStorage.removeItem(key);
    setStoredValue(defaultValue);
    window.dispatchEvent(new StorageEvent("local-storage", { key }));
  });
  react.useEffect(() => {
    setStoredValue(readValue());
  }, [key]);
  const handleStorageChange = react.useCallback(
    (event) => {
      if (event.key && event.key !== key) {
        return;
      }
      setStoredValue(readValue());
    },
    [key, readValue]
  );
  useEventListener("storage", handleStorageChange);
  useEventListener("local-storage", handleStorageChange);
  return [storedValue, setValue, removeValue];
}
var IS_SERVER2 = typeof window === "undefined";
function useMediaQuery(query, {
  defaultValue = false,
  initializeWithValue = true
} = {}) {
  const getMatches = (query2) => {
    if (IS_SERVER2) {
      return defaultValue;
    }
    return window.matchMedia(query2).matches;
  };
  const [matches, setMatches] = react.useState(() => {
    if (initializeWithValue) {
      return getMatches(query);
    }
    return defaultValue;
  });
  function handleChange() {
    setMatches(getMatches(query));
  }
  useIsomorphicLayoutEffect(() => {
    const matchMedia = window.matchMedia(query);
    handleChange();
    if (matchMedia.addListener) {
      matchMedia.addListener(handleChange);
    } else {
      matchMedia.addEventListener("change", handleChange);
    }
    return () => {
      if (matchMedia.removeListener) {
        matchMedia.removeListener(handleChange);
      } else {
        matchMedia.removeEventListener("change", handleChange);
      }
    };
  }, [query]);
  return matches;
}

// src/useDarkMode/useDarkMode.ts
var COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
var LOCAL_STORAGE_KEY = "usehooks-ts-dark-mode";
function useDarkMode(options = {}) {
  const {
    defaultValue,
    localStorageKey = LOCAL_STORAGE_KEY,
    initializeWithValue = true
  } = options;
  const isDarkOS = useMediaQuery(COLOR_SCHEME_QUERY, {
    initializeWithValue,
    defaultValue
  });
  const [isDarkMode, setDarkMode] = useLocalStorage(
    localStorageKey,
    defaultValue ?? isDarkOS ?? false,
    { initializeWithValue }
  );
  useIsomorphicLayoutEffect(() => {
    if (isDarkOS !== isDarkMode) {
      setDarkMode(isDarkOS);
    }
  }, [isDarkOS]);
  return {
    isDarkMode,
    toggle: () => {
      setDarkMode((prev) => !prev);
    },
    enable: () => {
      setDarkMode(true);
    },
    disable: () => {
      setDarkMode(false);
    },
    set: (value) => {
      setDarkMode(value);
    }
  };
}
function useUnmount(func) {
  const funcRef = react.useRef(func);
  funcRef.current = func;
  react.useEffect(
    () => () => {
      funcRef.current();
    },
    []
  );
}

// src/useDebounceCallback/useDebounceCallback.ts
function useDebounceCallback(func, delay = 500, options) {
  const debouncedFunc = react.useRef();
  useUnmount(() => {
    if (debouncedFunc.current) {
      debouncedFunc.current.cancel();
    }
  });
  const debounced = react.useMemo(() => {
    const debouncedFuncInstance = debounce__default.default(func, delay, options);
    const wrappedFunc = (...args) => {
      return debouncedFuncInstance(...args);
    };
    wrappedFunc.cancel = () => {
      debouncedFuncInstance.cancel();
    };
    wrappedFunc.isPending = () => {
      return !!debouncedFunc.current;
    };
    wrappedFunc.flush = () => {
      return debouncedFuncInstance.flush();
    };
    return wrappedFunc;
  }, [func, delay, options]);
  react.useEffect(() => {
    debouncedFunc.current = debounce__default.default(func, delay, options);
  }, [func, delay, options]);
  return debounced;
}
function useDebounceValue(initialValue, delay, options) {
  const eq = (options == null ? void 0 : options.equalityFn) ?? ((left, right) => left === right);
  const unwrappedInitialValue = initialValue instanceof Function ? initialValue() : initialValue;
  const [debouncedValue, setDebouncedValue] = react.useState(unwrappedInitialValue);
  const previousValueRef = react.useRef(unwrappedInitialValue);
  const updateDebouncedValue = useDebounceCallback(
    setDebouncedValue,
    delay,
    options
  );
  if (!eq(previousValueRef.current, unwrappedInitialValue)) {
    updateDebouncedValue(unwrappedInitialValue);
    previousValueRef.current = unwrappedInitialValue;
  }
  return [debouncedValue, updateDebouncedValue];
}
function useDocumentTitle(title, options = {}) {
  const { preserveTitleOnUnmount = true } = options;
  const defaultTitle = react.useRef(null);
  useIsomorphicLayoutEffect(() => {
    defaultTitle.current = window.document.title;
  }, []);
  useIsomorphicLayoutEffect(() => {
    window.document.title = title;
  }, [title]);
  useUnmount(() => {
    if (!preserveTitleOnUnmount && defaultTitle.current) {
      window.document.title = defaultTitle.current;
    }
  });
}
function useHover(elementRef) {
  const [value, setValue] = react.useState(false);
  const handleMouseEnter = () => {
    setValue(true);
  };
  const handleMouseLeave = () => {
    setValue(false);
  };
  useEventListener("mouseenter", handleMouseEnter, elementRef);
  useEventListener("mouseleave", handleMouseLeave, elementRef);
  return value;
}
function useIntersectionObserver({
  threshold = 0,
  root = null,
  rootMargin = "0%",
  freezeOnceVisible = false,
  initialIsIntersecting = false,
  onChange
} = {}) {
  var _a;
  const [ref, setRef] = react.useState(null);
  const [state, setState] = react.useState(() => ({
    isIntersecting: initialIsIntersecting,
    entry: void 0
  }));
  const callbackRef = react.useRef();
  callbackRef.current = onChange;
  const frozen = ((_a = state.entry) == null ? void 0 : _a.isIntersecting) && freezeOnceVisible;
  react.useEffect(() => {
    if (!ref)
      return;
    if (!("IntersectionObserver" in window))
      return;
    if (frozen)
      return;
    let unobserve;
    const observer = new IntersectionObserver(
      (entries) => {
        const thresholds = Array.isArray(observer.thresholds) ? observer.thresholds : [observer.thresholds];
        entries.forEach((entry) => {
          const isIntersecting = entry.isIntersecting && thresholds.some((threshold2) => entry.intersectionRatio >= threshold2);
          setState({ isIntersecting, entry });
          if (callbackRef.current) {
            callbackRef.current(isIntersecting, entry);
          }
          if (isIntersecting && freezeOnceVisible && unobserve) {
            unobserve();
            unobserve = void 0;
          }
        });
      },
      { threshold, root, rootMargin }
    );
    observer.observe(ref);
    return () => {
      observer.disconnect();
    };
  }, [
    ref,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(threshold),
    root,
    rootMargin,
    frozen,
    freezeOnceVisible
  ]);
  const prevRef = react.useRef(null);
  react.useEffect(() => {
    var _a2;
    if (!ref && ((_a2 = state.entry) == null ? void 0 : _a2.target) && !freezeOnceVisible && !frozen && prevRef.current !== state.entry.target) {
      prevRef.current = state.entry.target;
      setState({ isIntersecting: initialIsIntersecting, entry: void 0 });
    }
  }, [ref, state.entry, freezeOnceVisible, frozen, initialIsIntersecting]);
  const result = [
    setRef,
    !!state.isIntersecting,
    state.entry
  ];
  result.ref = result[0];
  result.isIntersecting = result[1];
  result.entry = result[2];
  return result;
}
function useIsClient() {
  const [isClient, setClient] = react.useState(false);
  react.useEffect(() => {
    setClient(true);
  }, []);
  return isClient;
}
function useIsMounted() {
  const isMounted = react.useRef(false);
  react.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);
  return react.useCallback(() => isMounted.current, []);
}
function useMap(initialState = /* @__PURE__ */ new Map()) {
  const [map, setMap] = react.useState(new Map(initialState));
  const actions = {
    set: react.useCallback((key, value) => {
      setMap((prev) => {
        const copy = new Map(prev);
        copy.set(key, value);
        return copy;
      });
    }, []),
    setAll: react.useCallback((entries) => {
      setMap(() => new Map(entries));
    }, []),
    remove: react.useCallback((key) => {
      setMap((prev) => {
        const copy = new Map(prev);
        copy.delete(key);
        return copy;
      });
    }, []),
    reset: react.useCallback(() => {
      setMap(() => /* @__PURE__ */ new Map());
    }, [])
  };
  return [map, actions];
}

// src/useOnClickOutside/useOnClickOutside.ts
function useOnClickOutside(ref, handler, eventType = "mousedown", eventListenerOptions = {}) {
  useEventListener(
    eventType,
    (event) => {
      const target = event.target;
      if (!target || !target.isConnected) {
        return;
      }
      const isOutside = Array.isArray(ref) ? ref.filter((r) => Boolean(r.current)).every((r) => r.current && !r.current.contains(target)) : ref.current && !ref.current.contains(target);
      if (isOutside) {
        handler(event);
      }
    },
    void 0,
    eventListenerOptions
  );
}
var IS_SERVER3 = typeof window === "undefined";
function useReadLocalStorage(key, options = {}) {
  let { initializeWithValue = true } = options;
  if (IS_SERVER3) {
    initializeWithValue = false;
  }
  const deserializer = react.useCallback(
    (value) => {
      if (options.deserializer) {
        return options.deserializer(value);
      }
      if (value === "undefined") {
        return void 0;
      }
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
      }
      return parsed;
    },
    [options]
  );
  const readValue = react.useCallback(() => {
    if (IS_SERVER3) {
      return null;
    }
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? deserializer(raw) : null;
    } catch (error) {
      console.warn(`Error reading localStorage key \u201C${key}\u201D:`, error);
      return null;
    }
  }, [key, deserializer]);
  const [storedValue, setStoredValue] = react.useState(() => {
    if (initializeWithValue) {
      return readValue();
    }
    return void 0;
  });
  react.useEffect(() => {
    setStoredValue(readValue());
  }, [key]);
  const handleStorageChange = react.useCallback(
    (event) => {
      if (event.key && event.key !== key) {
        return;
      }
      setStoredValue(readValue());
    },
    [key, readValue]
  );
  useEventListener("storage", handleStorageChange);
  useEventListener("local-storage", handleStorageChange);
  return storedValue;
}
var initialSize = {
  width: void 0,
  height: void 0
};
function useResizeObserver(options) {
  const { ref, box = "content-box" } = options;
  const [{ width, height }, setSize] = react.useState(initialSize);
  const isMounted = useIsMounted();
  const previousSize = react.useRef({ ...initialSize });
  const onResize = react.useRef(void 0);
  onResize.current = options.onResize;
  react.useEffect(() => {
    if (!ref.current)
      return;
    if (typeof window === "undefined" || !("ResizeObserver" in window))
      return;
    const observer = new ResizeObserver(([entry]) => {
      const boxProp = box === "border-box" ? "borderBoxSize" : box === "device-pixel-content-box" ? "devicePixelContentBoxSize" : "contentBoxSize";
      const newWidth = extractSize(entry, boxProp, "inlineSize");
      const newHeight = extractSize(entry, boxProp, "blockSize");
      const hasChanged = previousSize.current.width !== newWidth || previousSize.current.height !== newHeight;
      if (hasChanged) {
        const newSize = { width: newWidth, height: newHeight };
        previousSize.current.width = newWidth;
        previousSize.current.height = newHeight;
        if (onResize.current) {
          onResize.current(newSize);
        } else {
          if (isMounted()) {
            setSize(newSize);
          }
        }
      }
    });
    observer.observe(ref.current, { box });
    return () => {
      observer.disconnect();
    };
  }, [box, ref, isMounted]);
  return { width, height };
}
function extractSize(entry, box, sizeType) {
  if (!entry[box]) {
    if (box === "contentBoxSize") {
      return entry.contentRect[sizeType === "inlineSize" ? "width" : "height"];
    }
    return void 0;
  }
  return Array.isArray(entry[box]) ? entry[box][0][sizeType] : (
    // @ts-ignore Support Firefox's non-standard behavior
    entry[box][sizeType]
  );
}
var IS_SERVER4 = typeof window === "undefined";
function useScreen(options = {}) {
  let { initializeWithValue = true } = options;
  if (IS_SERVER4) {
    initializeWithValue = false;
  }
  const readScreen = () => {
    if (IS_SERVER4) {
      return void 0;
    }
    return window.screen;
  };
  const [screen, setScreen] = react.useState(() => {
    if (initializeWithValue) {
      return readScreen();
    }
    return void 0;
  });
  const debouncedSetScreen = useDebounceCallback(
    setScreen,
    options.debounceDelay
  );
  function handleSize() {
    const newScreen = readScreen();
    const setSize = options.debounceDelay ? debouncedSetScreen : setScreen;
    if (newScreen) {
      const {
        width,
        height,
        availHeight,
        availWidth,
        colorDepth,
        orientation,
        pixelDepth
      } = newScreen;
      setSize({
        width,
        height,
        availHeight,
        availWidth,
        colorDepth,
        orientation,
        pixelDepth
      });
    }
  }
  useEventListener("resize", handleSize);
  useIsomorphicLayoutEffect(() => {
    handleSize();
  }, []);
  return screen;
}
var cachedScriptStatuses = /* @__PURE__ */ new Map();
function getScriptNode(src) {
  const node = document.querySelector(
    `script[src="${src}"]`
  );
  const status = node == null ? void 0 : node.getAttribute("data-status");
  return {
    node,
    status
  };
}
function useScript(src, options) {
  const [status, setStatus] = react.useState(() => {
    if (!src || (options == null ? void 0 : options.shouldPreventLoad)) {
      return "idle";
    }
    if (typeof window === "undefined") {
      return "loading";
    }
    return cachedScriptStatuses.get(src) ?? "loading";
  });
  react.useEffect(() => {
    if (!src || (options == null ? void 0 : options.shouldPreventLoad)) {
      return;
    }
    const cachedScriptStatus = cachedScriptStatuses.get(src);
    if (cachedScriptStatus === "ready" || cachedScriptStatus === "error") {
      setStatus(cachedScriptStatus);
      return;
    }
    const script = getScriptNode(src);
    let scriptNode = script.node;
    if (!scriptNode) {
      scriptNode = document.createElement("script");
      scriptNode.src = src;
      scriptNode.async = true;
      if (options == null ? void 0 : options.id) {
        scriptNode.id = options.id;
      }
      scriptNode.setAttribute("data-status", "loading");
      document.body.appendChild(scriptNode);
      const setAttributeFromEvent = (event) => {
        const scriptStatus = event.type === "load" ? "ready" : "error";
        scriptNode == null ? void 0 : scriptNode.setAttribute("data-status", scriptStatus);
      };
      scriptNode.addEventListener("load", setAttributeFromEvent);
      scriptNode.addEventListener("error", setAttributeFromEvent);
    } else {
      setStatus(script.status ?? cachedScriptStatus ?? "loading");
    }
    const setStateFromEvent = (event) => {
      const newStatus = event.type === "load" ? "ready" : "error";
      setStatus(newStatus);
      cachedScriptStatuses.set(src, newStatus);
    };
    scriptNode.addEventListener("load", setStateFromEvent);
    scriptNode.addEventListener("error", setStateFromEvent);
    return () => {
      if (scriptNode) {
        scriptNode.removeEventListener("load", setStateFromEvent);
        scriptNode.removeEventListener("error", setStateFromEvent);
      }
      if (scriptNode && (options == null ? void 0 : options.removeOnUnmount)) {
        scriptNode.remove();
        cachedScriptStatuses.delete(src);
      }
    };
  }, [src, options == null ? void 0 : options.shouldPreventLoad, options == null ? void 0 : options.removeOnUnmount, options == null ? void 0 : options.id]);
  return status;
}
var IS_SERVER5 = typeof window === "undefined";
function useScrollLock(options = {}) {
  const { autoLock = true, lockTarget, widthReflow = true } = options;
  const [isLocked, setIsLocked] = react.useState(false);
  const target = react.useRef(null);
  const originalStyle = react.useRef(null);
  const lock = () => {
    if (target.current) {
      const { overflow, paddingRight } = target.current.style;
      originalStyle.current = { overflow, paddingRight };
      if (widthReflow) {
        const offsetWidth = target.current === document.body ? window.innerWidth : target.current.offsetWidth;
        const currentPaddingRight = parseInt(window.getComputedStyle(target.current).paddingRight, 10) || 0;
        const scrollbarWidth = offsetWidth - target.current.scrollWidth;
        target.current.style.paddingRight = `${scrollbarWidth + currentPaddingRight}px`;
      }
      target.current.style.overflow = "hidden";
      setIsLocked(true);
    }
  };
  const unlock = () => {
    if (target.current && originalStyle.current) {
      target.current.style.overflow = originalStyle.current.overflow;
      if (widthReflow) {
        target.current.style.paddingRight = originalStyle.current.paddingRight;
      }
    }
    setIsLocked(false);
  };
  useIsomorphicLayoutEffect(() => {
    if (IS_SERVER5)
      return;
    if (lockTarget) {
      target.current = typeof lockTarget === "string" ? document.querySelector(lockTarget) : lockTarget;
    }
    if (!target.current) {
      target.current = document.body;
    }
    if (autoLock) {
      lock();
    }
    return () => {
      unlock();
    };
  }, [autoLock, lockTarget, widthReflow]);
  return { isLocked, lock, unlock };
}
var IS_SERVER6 = typeof window === "undefined";
function useSessionStorage(key, initialValue, options = {}) {
  const { initializeWithValue = true } = options;
  const serializer = react.useCallback(
    (value) => {
      if (options.serializer) {
        return options.serializer(value);
      }
      return JSON.stringify(value);
    },
    [options]
  );
  const deserializer = react.useCallback(
    (value) => {
      if (options.deserializer) {
        return options.deserializer(value);
      }
      if (value === "undefined") {
        return void 0;
      }
      const defaultValue = initialValue instanceof Function ? initialValue() : initialValue;
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return defaultValue;
      }
      return parsed;
    },
    [options, initialValue]
  );
  const readValue = react.useCallback(() => {
    const initialValueToUse = initialValue instanceof Function ? initialValue() : initialValue;
    if (IS_SERVER6) {
      return initialValueToUse;
    }
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? deserializer(raw) : initialValueToUse;
    } catch (error) {
      console.warn(`Error reading sessionStorage key \u201C${key}\u201D:`, error);
      return initialValueToUse;
    }
  }, [initialValue, key, deserializer]);
  const [storedValue, setStoredValue] = react.useState(() => {
    if (initializeWithValue) {
      return readValue();
    }
    return initialValue instanceof Function ? initialValue() : initialValue;
  });
  const setValue = useEventCallback((value) => {
    if (IS_SERVER6) {
      console.warn(
        `Tried setting sessionStorage key \u201C${key}\u201D even though environment is not a client`
      );
    }
    try {
      const newValue = value instanceof Function ? value(readValue()) : value;
      window.sessionStorage.setItem(key, serializer(newValue));
      setStoredValue(newValue);
      window.dispatchEvent(new StorageEvent("session-storage", { key }));
    } catch (error) {
      console.warn(`Error setting sessionStorage key \u201C${key}\u201D:`, error);
    }
  });
  const removeValue = useEventCallback(() => {
    if (IS_SERVER6) {
      console.warn(
        `Tried removing sessionStorage key \u201C${key}\u201D even though environment is not a client`
      );
    }
    const defaultValue = initialValue instanceof Function ? initialValue() : initialValue;
    window.sessionStorage.removeItem(key);
    setStoredValue(defaultValue);
    window.dispatchEvent(new StorageEvent("session-storage", { key }));
  });
  react.useEffect(() => {
    setStoredValue(readValue());
  }, [key]);
  const handleStorageChange = react.useCallback(
    (event) => {
      if (event.key && event.key !== key) {
        return;
      }
      setStoredValue(readValue());
    },
    [key, readValue]
  );
  useEventListener("storage", handleStorageChange);
  useEventListener("session-storage", handleStorageChange);
  return [storedValue, setValue, removeValue];
}
function useStep(maxStep) {
  const [currentStep, setCurrentStep] = react.useState(1);
  const canGoToNextStep = currentStep + 1 <= maxStep;
  const canGoToPrevStep = currentStep - 1 > 0;
  const setStep = react.useCallback(
    (step) => {
      const newStep = step instanceof Function ? step(currentStep) : step;
      if (newStep >= 1 && newStep <= maxStep) {
        setCurrentStep(newStep);
        return;
      }
      throw new Error("Step not valid");
    },
    [maxStep, currentStep]
  );
  const goToNextStep = react.useCallback(() => {
    if (canGoToNextStep) {
      setCurrentStep((step) => step + 1);
    }
  }, [canGoToNextStep]);
  const goToPrevStep = react.useCallback(() => {
    if (canGoToPrevStep) {
      setCurrentStep((step) => step - 1);
    }
  }, [canGoToPrevStep]);
  const reset = react.useCallback(() => {
    setCurrentStep(1);
  }, []);
  return [
    currentStep,
    {
      goToNextStep,
      goToPrevStep,
      canGoToNextStep,
      canGoToPrevStep,
      setStep,
      reset
    }
  ];
}

// src/useTernaryDarkMode/useTernaryDarkMode.ts
var COLOR_SCHEME_QUERY2 = "(prefers-color-scheme: dark)";
var LOCAL_STORAGE_KEY2 = "usehooks-ts-ternary-dark-mode";
function useTernaryDarkMode({
  defaultValue = "system",
  localStorageKey = LOCAL_STORAGE_KEY2,
  initializeWithValue = true
} = {}) {
  const isDarkOS = useMediaQuery(COLOR_SCHEME_QUERY2, { initializeWithValue });
  const [mode, setMode] = useLocalStorage(localStorageKey, defaultValue, {
    initializeWithValue
  });
  const isDarkMode = mode === "dark" || mode === "system" && isDarkOS;
  const toggleTernaryDarkMode = () => {
    const modes = ["light", "system", "dark"];
    setMode((prevMode) => {
      const nextIndex = (modes.indexOf(prevMode) + 1) % modes.length;
      return modes[nextIndex];
    });
  };
  return {
    isDarkMode,
    ternaryDarkMode: mode,
    setTernaryDarkMode: setMode,
    toggleTernaryDarkMode
  };
}
function useTimeout(callback, delay) {
  const savedCallback = react.useRef(callback);
  useIsomorphicLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  react.useEffect(() => {
    if (!delay && delay !== 0) {
      return;
    }
    const id = setTimeout(() => {
      savedCallback.current();
    }, delay);
    return () => {
      clearTimeout(id);
    };
  }, [delay]);
}
function useToggle(defaultValue) {
  const [value, setValue] = react.useState(!!defaultValue);
  const toggle = react.useCallback(() => {
    setValue((x) => !x);
  }, []);
  return [value, toggle, setValue];
}
var IS_SERVER7 = typeof window === "undefined";
function useWindowSize(options = {}) {
  let { initializeWithValue = true } = options;
  if (IS_SERVER7) {
    initializeWithValue = false;
  }
  const [windowSize, setWindowSize] = react.useState(() => {
    if (initializeWithValue) {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    }
    return {
      width: void 0,
      height: void 0
    };
  });
  const debouncedSetWindowSize = useDebounceCallback(
    setWindowSize,
    options.debounceDelay
  );
  function handleSize() {
    const setSize = options.debounceDelay ? debouncedSetWindowSize : setWindowSize;
    setSize({
      width: window.innerWidth,
      height: window.innerHeight
    });
  }
  useEventListener("resize", handleSize);
  useIsomorphicLayoutEffect(() => {
    handleSize();
  }, []);
  return windowSize;
}

exports.useBoolean = useBoolean;
exports.useClickAnyWhere = useClickAnyWhere;
exports.useCopyToClipboard = useCopyToClipboard;
exports.useCountdown = useCountdown;
exports.useCounter = useCounter;
exports.useDarkMode = useDarkMode;
exports.useDebounceCallback = useDebounceCallback;
exports.useDebounceValue = useDebounceValue;
exports.useDocumentTitle = useDocumentTitle;
exports.useEventCallback = useEventCallback;
exports.useEventListener = useEventListener;
exports.useHover = useHover;
exports.useIntersectionObserver = useIntersectionObserver;
exports.useInterval = useInterval;
exports.useIsClient = useIsClient;
exports.useIsMounted = useIsMounted;
exports.useIsomorphicLayoutEffect = useIsomorphicLayoutEffect;
exports.useLocalStorage = useLocalStorage;
exports.useMap = useMap;
exports.useMediaQuery = useMediaQuery;
exports.useOnClickOutside = useOnClickOutside;
exports.useReadLocalStorage = useReadLocalStorage;
exports.useResizeObserver = useResizeObserver;
exports.useScreen = useScreen;
exports.useScript = useScript;
exports.useScrollLock = useScrollLock;
exports.useSessionStorage = useSessionStorage;
exports.useStep = useStep;
exports.useTernaryDarkMode = useTernaryDarkMode;
exports.useTimeout = useTimeout;
exports.useToggle = useToggle;
exports.useUnmount = useUnmount;
exports.useWindowSize = useWindowSize;
