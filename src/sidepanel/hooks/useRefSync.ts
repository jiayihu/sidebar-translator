import { useEffect, useRef } from 'react';

/**
 * Keeps a ref synchronized with a value.
 * Useful for accessing current values in callbacks or event handlers
 * without triggering re-renders or re-creating the callback.
 *
 * @param value - The value to keep synchronized
 * @returns A ref that always contains the current value
 *
 * @example
 * ```tsx
 * const countRef = useRefSync(count);
 * // countRef.current always equals the latest count value
 * ```
 */
export function useRefSync<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
