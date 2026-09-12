import { describe, expect, it } from "vitest";
import {
  DELAY_NONE_PRESET,
  DELAY_PRESETS,
  LATEST_FOLLOWERS_LIMIT,
  QUEUE_LIMIT_PRESETS,
  RUN_DURATION_PRESETS,
  UNLIMITED_QUEUE_LIMIT,
  isUnlimitedQueue,
} from "@/lib/crawler/types";

describe("crawler constants", () => {
  it("fetches only latest 10 followers per user", () => {
    expect(LATEST_FOLLOWERS_LIMIT).toBe(10);
  });

  it("orders delay presets ascending, then no-delay", () => {
    expect(DELAY_PRESETS.map((p) => p.seconds)).toEqual([30, 60, 120, 300]);
    expect(DELAY_NONE_PRESET.seconds).toBe(0);
  });

  it("orders run duration ascending, then unlimited", () => {
    expect(RUN_DURATION_PRESETS.map((p) => p.minutes)).toEqual([
      10, 30, 60, 120, 300, 0,
    ]);
  });

  it("orders queue limit presets ascending", () => {
    expect([...QUEUE_LIMIT_PRESETS]).toEqual([50, 100, 250, 500]);
  });

  it("validates custom delay as non-negative integer", () => {
    function valid(n: number) {
      return Number.isFinite(n) && n >= 0;
    }
    expect(valid(0)).toBe(true);
    expect(valid(90)).toBe(true);
    expect(valid(-1)).toBe(false);
    expect(valid(Number.NaN)).toBe(false);
  });

  it("treats queue limit 0 as unlimited", () => {
    expect(UNLIMITED_QUEUE_LIMIT).toBe(0);
    expect(isUnlimitedQueue(0)).toBe(true);
    expect(isUnlimitedQueue(100)).toBe(false);
  });
});
