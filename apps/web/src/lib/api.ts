export type User = { id: string; name: string; email: string; phone: string | null; role: "PASSENGER" | "DRIVER" };
export type Ride = {
  id: string; pickup: string; destination: string; seats: number; status: string;
  baseFarePaisa: number; distanceChargePaisa: number; poolDiscountPaisa: number;
  farePaisa: number; payment: string; createdAt: string;
  membership?: { pool: { id: string; status: string; vehicle: { name: string; driver: { name: string; phone: string | null } } } } | null;
  events?: { from: string | null; to: string; note: string | null; createdAt: string }[];
};
export type FareQuote = { distanceKm: number; baseFarePaisa: number; distanceChargePaisa: number; poolDiscountPaisa: number; farePaisa: number };
export type FareEstimate = { solo: FareQuote; pooled: FareQuote };
export type DriverDashboard = {
  vehicle: { id: string; name: string; capacity: number; isOnline: boolean };
  pending: (Pick<Ride, "id" | "pickup" | "destination" | "seats" | "farePaisa" | "createdAt"> & { passenger: { name: string } })[];
  pools: { id: string; status: string; pickup: string; createdAt: string; memberships: { seats: number; request: Ride & { passenger: { name: string; phone: string | null } } }[] }[];
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init, credentials: "include", cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const taka = (paisa: number) => `৳${(paisa / 100).toFixed(0)}`;
export const time = (value: string) => new Date(value).toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
