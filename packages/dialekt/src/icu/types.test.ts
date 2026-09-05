import { describe, expect, it } from "vitest";
import { IcuParseError } from "./types.js";

describe("IcuParseError", () => {
  it("has correct tag", () => {
    const err = new IcuParseError("boom");
    expect(err._tag).toBe("IcuParseError");
    expect(err.message).toBe("boom");
  });
});
