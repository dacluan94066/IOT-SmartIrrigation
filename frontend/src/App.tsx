import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import { api } from "./services/api";
import type { Session } from "./types/api";
import { DashboardProvider } from "./hooks/useDashboard";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { Loading, EmptyState } from "./components/ui";
import Login from "./pages/Login";
const Overview = lazy(() => import("./pages/Overview"));
const Control = lazy(() => import("./pages/Control"));
const History = lazy(() => import("./pages/History"));
const System = lazy(() => import("./pages/System"));
function ResetRouteScroll() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
export default function App() {
  const [session, setSession] = useState<Session>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const restore = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await api.session(signal);
      if (!signal?.aborted) {
        setSession(result.authenticated ? result : undefined);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : "Không thể kết nối.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void restore(controller.signal);
    return () => controller.abort();
  }, [restore]);
  const expired = useCallback(() => {
    setSession(undefined);
    setError("Phiên đã hết hạn. Vui lòng đăng nhập lại.");
  }, []);
  const logout = async () => {
    if (!session) return;
    try {
      await api.logout(session);
      setSession(undefined);
      setError("");
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Chưa thể đăng xuất trên Server.",
      );
    }
  };
  if (loading)
    return (
      <div className="app-loading">
        <Loading />
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={(s) => {
          setSession(s);
          setError("");
        }}
        initialError={error}
        onRetry={() => void restore()}
      />
    );
  return (
    <BrowserRouter>
      <ResetRouteScroll />
      <DashboardProvider session={session} onExpired={expired}>
        <Routes>
          <Route element={<DashboardLayout onLogout={() => void logout()} />}>
            <Route
              index
              element={
                <Suspense fallback={<Loading />}>
                  <Overview />
                </Suspense>
              }
            />
            <Route
              path="dieu-khien"
              element={
                <Suspense fallback={<Loading />}>
                  <Control />
                </Suspense>
              }
            />
            <Route
              path="lich-su"
              element={
                <Suspense fallback={<Loading />}>
                  <History />
                </Suspense>
              }
            />
            <Route
              path="he-thong"
              element={
                <Suspense fallback={<Loading />}>
                  <System />
                </Suspense>
              }
            />
            <Route
              path="*"
              element={
                <section className="panel">
                  <EmptyState
                    title="Không tìm thấy trang"
                    description="Trang này không thuộc Dashboard SmartIrrigation."
                  />
                  <Link className="button button-green" to="/">
                    Về tổng quan
                  </Link>
                </section>
              }
            />
          </Route>
        </Routes>
      </DashboardProvider>
    </BrowserRouter>
  );
}
