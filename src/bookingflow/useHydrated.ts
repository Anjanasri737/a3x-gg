import { useEffect, useState } from "react";

/** true only after the browser has mounted — keeps clock-based UI out of SSR HTML */
export function useHydrated() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
