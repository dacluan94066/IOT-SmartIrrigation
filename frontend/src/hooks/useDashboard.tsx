import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "../services/api";
import type { Session } from "../types/api";
import { usePolling } from "./usePolling";
import { isDeviceOnline, telemetryAge } from "../utils/format";
function useDashboardData(session: Session, onExpired: () => void) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const group = new AbortController(),
        combined = AbortSignal.any([signal, group.signal]);
      try {
        const [health, state] = await Promise.all([
          api.health(combined),
          api.state(session.deviceId, combined),
        ]);
        return { health, state };
      } catch (e) {
        group.abort();
        throw e;
      }
    },
    [session.deviceId],
  );
  const loadCommands = useCallback(
    (signal: AbortSignal) => api.commands(session.deviceId, signal),
    [session.deviceId],
  );
  const current = usePolling(load, 3000),
    commands = usePolling(loadCommands, 2000);
  const [now, setNow] = useState(Date.now()),
    [startedAt] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      [current.error, commands.error].some(
        (e) => e instanceof ApiError && e.status === 401,
      )
    )
      onExpired();
  }, [current.error, commands.error, onExpired]);
  const serverNow = current.data
    ? Date.parse(current.data.health.serverTime) +
      Math.max(0, now - current.updatedAt)
    : Date.parse(session.serverTime) + Math.max(0, now - startedAt);
  const configured = Number(import.meta.env.VITE_OFFLINE_AFTER_MS);
  const offlineMs =
    Number.isFinite(configured) && configured >= 15000
      ? Math.min(configured, 120000)
      : session.offlineAfterMs;
  const state = current.data?.state;
  const online = isDeviceOnline(state, serverNow, offlineMs);
  const backendConnected =
    Boolean(current.data) && !current.error && now - current.updatedAt < 10000;
  const refresh = () => {
    current.refresh();
    commands.refresh();
  };
  return {
    session,
    state,
    current,
    commands,
    serverNow,
    offlineMs,
    online,
    backendConnected,
    isCurrent: online && backendConnected,
    age: telemetryAge(state, serverNow),
    refresh,
  };
}
const DashboardContext = createContext<ReturnType<
  typeof useDashboardData
> | null>(null);
export function DashboardProvider({
  session,
  onExpired,
  children,
}: {
  session: Session;
  onExpired: () => void;
  children: ReactNode;
}) {
  const value = useDashboardData(session, onExpired);
  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
export const useDashboard = () => {
  const value = useContext(DashboardContext);
  if (!value) throw new Error("Missing DashboardProvider");
  return value;
};
