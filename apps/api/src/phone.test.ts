import { describe, expect, it } from "vitest";
import { bangladeshPhone } from "./phone.js";

describe("Bangladesh mobile numbers", () => {
  it("normalizes local and international forms to E.164", () => {
    expect(bangladeshPhone.parse("01712 345678")).toBe("+8801712345678");
    expect(bangladeshPhone.parse("8801712345678")).toBe("+8801712345678");
    expect(bangladeshPhone.parse("+880-1712-345678")).toBe("+8801712345678");
  });
  it("rejects incomplete and non-mobile numbers", () => {
    expect(bangladeshPhone.safeParse("01712345").success).toBe(false);
    expect(bangladeshPhone.safeParse("01112345678").success).toBe(false);
    expect(bangladeshPhone.safeParse("+441712345678").success).toBe(false);
  });
});
