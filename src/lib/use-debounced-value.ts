import { useEffect, useState } from "react";

/** Delays reflecting a fast-changing value (e.g. a search input) by `delayMs`,
 * so server-side search queries aren't fired on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
