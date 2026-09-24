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

// Values are integer paisa. Each booking pays per seat; the 20% discount applies
// when two or more active bookings share a pool, before the driver starts.
export function farePaisa(pickup: Area, destination: Area, seats: number, pooled: boolean): number {
  const undiscounted = (5000 + 1500 * distanceKm(pickup, destination)) * seats;
  return pooled ? Math.round(undiscounted * 0.8) : undiscounted;
}

export const nextPoolStatus: Record<string, string> = {
  ACCEPTED: "DRIVER_ARRIVED",
  DRIVER_ARRIVED: "STARTED",
  STARTED: "COMPLETED"
};

export function canPassengerCancel(status: string): boolean {
  return ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED"].includes(status);
}
