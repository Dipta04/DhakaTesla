import { describe, expect, it } from "vitest";
import { canPassengerCancel, compatible, farePaisa, nextPoolStatus } from "./domain.js";

describe("the Banani demo", () => {
  it("matches overlapping destinations from the same pickup", () => {
    expect(compatible({pickup:"Banani", destination:"Mohakhali"}, {pickup:"Banani", destination:"Gulshan"})).toBe(true);
    expect(compatible({pickup:"Uttara", destination:"Mohakhali"}, {pickup:"Banani", destination:"Gulshan"})).toBe(false);
  });
  it("calculates Nusrat and Rafiq's fares in integer paisa", () => {
    expect(farePaisa("Banani", "Mohakhali", 1, false)).toBe(9500);
    expect(farePaisa("Banani", "Mohakhali", 1, true)).toBe(7600);
    expect(farePaisa("Banani", "Gulshan", 1, true)).toBe(8800);
  });
  it("limits transitions and cancellation", () => {
    expect(nextPoolStatus.ACCEPTED).toBe("DRIVER_ARRIVED");
    expect(nextPoolStatus.STARTED).toBe("COMPLETED");
    expect(nextPoolStatus.COMPLETED).toBeUndefined();
    expect(canPassengerCancel("DRIVER_ARRIVED")).toBe(true);
    expect(canPassengerCancel("STARTED")).toBe(false);
  });
});
