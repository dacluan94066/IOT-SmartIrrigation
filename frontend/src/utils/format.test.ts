import { describe, it, expect } from "vitest";
import {
  chartRows,
  humanReason,
  isDeviceOnline,
  number,
  telemetryAge,
  vietnamInputToISO,
} from "./format";
import { telemetrySchema } from "../types/api";
const sample = telemetrySchema.parse({
  id: 1,
  deviceId: "esp32-01",
  bootId: "unit",
  sequence: 1,
  receivedAt: "2026-10-21T19:00:00.000Z",
  deviceTimestamp: null,
  soilMoisturePercent: 25,
  temperatureC: null,
  rainProbabilityPercent: null,
  precipitationMm: null,
  weatherSource: "REAL",
  weatherStatus: "UNKNOWN",
  pumpState: "TAT",
  decision: "TAM_HOAN",
  reason: "unit fixture",
  mode: "AUTO",
  uptimeMs: 0,
  weatherUpdatedAt: null,
});
describe("readings, freshness, history (unit fixtures only)", () => {
  it("unavailable values are not fabricated zero", () => {
    expect(number(null)).toBe("—");
    expect(number(undefined)).toBe("—");
    expect(number(0)).toBe("0");
    expect(sample.relativeHumidityPercent).toBeUndefined();
  });
  it("uses receipt timestamp, not device clock or health alone", () => {
    const t = Date.parse(sample.receivedAt);
    expect(isDeviceOnline(sample, t + 29999, 30000)).toBe(true);
    expect(isDeviceOnline(sample, t + 30000, 30000)).toBe(false);
    expect(isDeviceOnline(null, t, 30000)).toBe(false);
    expect(telemetryAge(sample, t - 6000)).toBeNull();
  });
  it("preserves gaps/null weather, sorts real samples chronologically", () => {
    const rows = chartRows(
      [{ ...sample, id: 2, receivedAt: "2026-10-21T19:01:00.000Z" }, sample],
      30000,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].at).toBe(Date.parse(sample.receivedAt));
    expect(rows[0].temperature).toBeNull();
    expect(rows[1].soil).toBeNull();
  });
  it("gives understandable safety rejection without concealing unknown reasons", () => {
    expect(humanReason("Do am dat da dat nguong 70%")).toContain(
      "Không thể bật máy bơm",
    );
    expect(humanReason("custom reason")).toBe("custom reason");
  });
  it("rejects changed or invalid API shape", () => {
    expect(
      telemetrySchema.safeParse({ ...sample, soilMoisturePercent: "25" })
        .success,
    ).toBe(false);
    expect(
      telemetrySchema.safeParse({ ...sample, pumpState: "ON" }).success,
    ).toBe(false);
  });
  it("date filter uses explicit Vietnam timezone, independent of browser locale", () => {
    expect(vietnamInputToISO("2026-10-22T02:00")).toBe(
      "2026-10-21T19:00:00.000Z",
    );
  });
});
