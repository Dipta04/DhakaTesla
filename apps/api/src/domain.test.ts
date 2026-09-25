import { describe, expect, it } from "vitest";
import { AREAS, canPassengerCancel, compatible, fareBreakdown, farePaisa, nextPoolStatus } from "./domain.js";

describe("the Banani demo", () => {
  it("matches overlapping destinations from the same pickup", () => {
    expect(compatible({pickup:"Banani", destination:"Mohakhali"}, {pickup:"Banani", destination:"Gulshan"})).toBe(true);
    expect(compatible({pickup:"Uttara", destination:"Mohakhali"}, {pickup:"Banani", destination:"Gulshan"})).toBe(false);
  });
  it("calculates Nusrat and Rafiq's fares in integer paisa", () => {
    expect(farePaisa("Banani", "Mohakhali", 1, false)).toBe(9500);
    expect(farePaisa("Banani", "Mohakhali", 1, true)).toBe(7600);
    expect(farePaisa("Banani", "Gulshan", 1, true)).toBe(8800);
    expect(fareBreakdown("Banani", "Mohakhali", 1, true)).toEqual({
      distanceKm: 3, baseFarePaisa: 5000, distanceChargePaisa: 4500,
      poolDiscountPaisa: 1900, farePaisa: 7600
    });
  });
  it("subtracts the discount and never raises the fare for the same booking", () => {
    for (const pickup of AREAS) for (const destination of AREAS) {
      if (pickup === destination) continue;
      for (const seats of [1, 2, 3, 4, 5]) {
        const solo = fareBreakdown(pickup, destination, seats, false);
        const pooled = fareBreakdown(pickup, destination, seats, true);
        expect(pooled.farePaisa).toBe(pooled.baseFarePaisa + pooled.distanceChargePaisa - pooled.poolDiscountPaisa);
        expect(pooled.poolDiscountPaisa).toBe(Math.floor(solo.farePaisa / 5));
        expect(pooled.farePaisa).toBeLessThan(solo.farePaisa);
      }
    }
  });
  it("limits transitions and cancellation", () => {
    expect(nextPoolStatus.ACCEPTED).toBe("DRIVER_ARRIVED");
    expect(nextPoolStatus.STARTED).toBe("COMPLETED");
    expect(nextPoolStatus.COMPLETED).toBeUndefined();
    expect(canPassengerCancel("DRIVER_ARRIVED")).toBe(true);
    expect(canPassengerCancel("STARTED")).toBe(false);
  });
});
