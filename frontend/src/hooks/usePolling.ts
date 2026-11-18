import { useEffect, useRef, useState, useCallback } from "react";
// Recursive timeout: mỗi resource chỉ có một request đang chạy, không setInterval chồng request.
export function usePolling<T>(
  load: (signal: AbortSignal) => Promise<T>,
  interval: number,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [initialLoading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(0);
  const runner = useRef<() => void>(() => {});
  const refresh = useCallback(() => runner.current(), []);
  useEffect(() => {
    let active = true,
      busy = false,
      requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined,
      controller: AbortController | undefined;
    const run = async () => {
      if (!active) return;
      if (busy) {
        requested = true;
        return;
      }
      clearTimeout(timer);
      busy = true;
      controller = new AbortController();
      try {
        const result = await load(controller.signal);
        if (active) {
          setData(result);
          setUpdatedAt(Date.now());
          setError(undefined);
        }
      } catch (e) {
        if (active && !controller.signal.aborted)
          setError(
            e instanceof Error ? e : new Error("Không thể tải dữ liệu."),
          );
      } finally {
        busy = false;
        if (active) {
          setLoading(false);
          timer = setTimeout(run, requested ? 0 : interval);
          requested = false;
        }
      }
    };
    runner.current = () => {
      void run();
    };
    void run();
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      runner.current = () => {};
    };
  }, [load, interval]);
  return { data, error, initialLoading, updatedAt, refresh };
}
