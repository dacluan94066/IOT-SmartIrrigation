import { useCallback } from "react";
import { api } from "../services/api";
import { usePolling } from "./usePolling";
import { useDashboard } from "./useDashboard";
export type TimeRange = { period: number; from?: string; to?: string };
export function useHistory(
  page = 1,
  limit = 100,
  range: TimeRange = { period: 3600000 },
) {
  const { session } = useDashboard();
  const { period, from, to } = range;
  const key = JSON.stringify([page, limit, period, from, to]);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const start =
        from ||
        (period ? new Date(Date.now() - period).toISOString() : undefined);
      return {
        key,
        result: await api.history(
          session.deviceId,
          page,
          limit,
          start,
          to,
          signal,
        ),
      };
    },
    [session.deviceId, page, limit, period, from, to, key],
  );
  const poll = usePolling(load, 30000);
  return {
    ...poll,
    result: poll.data?.key === key ? poll.data.result : undefined,
  };
}
