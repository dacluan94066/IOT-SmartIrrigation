import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
// HTTP read-only integration với Backend đang chạy và telemetry thật. Không gửi fixture/mock.
test("Live Dashboard API through Vite proxy, credentials stay outside bundle", async (t) => {
  const base = "http://127.0.0.1:5173/api/v1";
  const password = JSON.parse(
    readFileSync(
      new URL("../../backend/.dashboard-login", import.meta.url),
      "utf8",
    ),
  ).password;
  const response = await fetch(base + "/dashboard/session", {
    method: "POST",
    headers: {
      Origin: "http://127.0.0.1:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  assert.equal(response.status, 200);
  const session = (await response.json()).data;
  const cookie = response.headers.get("set-cookie").split(";")[0];
  t.after(async () => {
    await fetch(base + "/dashboard/logout", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://127.0.0.1:5173",
        "X-CSRF-Token": session.csrfToken,
      },
    });
  });
  const get = async (path) => {
    const r = await fetch(base + path, { headers: { Cookie: cookie } });
    assert.equal(r.status, 200);
    return r.json();
  };
  await t.test("health, real telemetry and freshness", async () => {
    const health = (await get("/health")).data;
    const state = (await get("/dashboard/state?deviceId=" + session.deviceId))
      .data;
    assert.ok(
      state && state.bootId !== "pc-smoke",
      "Needs actual ESP32/Wokwi telemetry, not PC sample",
    );
    assert.ok(
      Date.parse(health.serverTime) - Date.parse(state.receivedAt) <
        session.offlineAfterMs,
      "ESP32 telemetry must be fresh",
    );
    assert.ok(["REAL", "SIMULATED"].includes(state.weatherSource));
    assert.equal(typeof state.soilMoisturePercent, "number");
    console.log(
      `LIVE READBACK: boot=${state.bootId}, soil=${state.soilMoisturePercent}, weather=${state.weatherSource}/${state.weatherStatus}, rain=${state.rainProbabilityPercent}, pump=${state.pumpState}`,
    );
  });
  await t.test("bounded history and actual ACK records", async () => {
    const history = await get(
      "/dashboard/history?deviceId=" + session.deviceId + "&limit=20&page=1",
    );
    assert.ok(history.data.length > 0 && history.data.length <= 20);
    assert.ok(history.meta.total > 0);
    const commands = (
      await get("/dashboard/commands?deviceId=" + session.deviceId)
    ).data;
    assert.ok(Array.isArray(commands));
    assert.ok(
      commands.some(
        (c) => c.ackAt && ["EXECUTED", "REJECTED"].includes(c.status),
      ),
    );
  });
  await t.test(
    "no ADMIN/DEVICE token or dashboard password in production assets",
    () => {
      const env = readFileSync(
        new URL("../../backend/.env", import.meta.url),
        "utf8",
      );
      const secrets = ["ADMIN_API_TOKEN", "DEVICE_API_TOKEN"].map((key) =>
        env.match(new RegExp("^" + key + "=(.+)$", "m"))?.[1]?.trim(),
      );
      const dir = fileURLToPath(new URL("../dist/assets/", import.meta.url));
      const bundle = readdirSync(dir)
        .filter((n) => /\.(js|css)$/.test(n))
        .map((n) => readFileSync(dir + "/" + n, "utf8"))
        .join("\n");
      for (const secret of [...secrets, password]) {
        assert.ok(secret);
        assert.ok(!bundle.includes(secret), "Secret found in bundle");
      }
      assert.ok(
        !bundle.includes("ADMIN_API_TOKEN=") &&
          !bundle.includes("DEVICE_API_TOKEN="),
      );
    },
  );
});
