export const AREAS = ["Banani", "Gulshan", "Mohakhali", "Dhanmondi", "Mirpur", "Uttara", "Farmgate", "Bashundhara"] as const;
export type Area = typeof AREAS[number];

// Deliberately simple demo distances: grid units are kilometres, not road routing.
const points: Record<Area, [number, number]> = {
  Banani: [0, 0], Gulshan: [0, 4], Mohakhali: [3, 0],
  Dhanmondi: [7, -3], Mirpur: [8, 4], Uttara: [-8, 2],
  Farmgate: [5, -1], Bashundhara: [-2, 7]
};

export function distanceKm(from: Area, to: Area): number {
  const [x1, y1] = points[from];
  const [x2, y2] = points[to];
  return Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1)));
}

export function compatible(a: { pickup: string; destination: string }, b: { pickup: string; destination: string }): boolean {
  if (a.pickup !== b.pickup) return false;
  if (a.destination === b.destination) return true;
  return a.pickup === "Banani" &&
    [a.destination, b.destination].every((zone) => zone === "Mohakhali" || zone === "Gulshan");
}

// Each component is integer paisa for the whole booking. The fare is always
// baseFare + distanceCharge - poolDiscount, with no floating-point money.
export function fareBreakdown(pickup: Area, destination: Area, seats: number, pooled: boolean) {
  const km = distanceKm(pickup, destination);
  const baseFarePaisa = 5000 * seats;
  const distanceChargePaisa = 1500 * km * seats;
  const subtotalPaisa = baseFarePaisa + distanceChargePaisa;
  const poolDiscountPaisa = pooled ? Math.floor(subtotalPaisa / 5) : 0;
  return {
    distanceKm: km, baseFarePaisa, distanceChargePaisa, poolDiscountPaisa,
    farePaisa: baseFarePaisa + distanceChargePaisa - poolDiscountPaisa
  };
}

export function farePaisa(pickup: Area, destination: Area, seats: number, pooled: boolean): number {
  return fareBreakdown(pickup, destination, seats, pooled).farePaisa;
}

export const nextPoolStatus: Record<string, string> = {
  ACCEPTED: "DRIVER_ARRIVED",
  DRIVER_ARRIVED: "STARTED",
  STARTED: "COMPLETED"
};

export function canPassengerCancel(status: string): boolean {
  return ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED"].includes(status);
}
