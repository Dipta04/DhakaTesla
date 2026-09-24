import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { acceptRequest, advancePool, cancelRequest, createRequest, getPassengerRide } from "./rides.js";

// Opt-in because this suite creates data and needs a migrated, disposable Postgres DB.
// Set DATABASE_URL and TEST_DATABASE_URL to the same *_test database before running.
const run = !!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL.includes("_test");
type Fixture = { driverId: string; passengerIds: string[]; vehicleId: string };
let fixture: Fixture | undefined;

describe.skipIf(!run)("ride integrity in PostgreSQL", () => {
  beforeEach(async () => {
    const suffix = randomUUID();
    const driver = await db.user.create({ data: { name: "Jashim", email: `jashim-${suffix}@test.local`, role: "DRIVER", passwordHash: "test-only" } });
    const passengers = await Promise.all(["Nusrat", "Rafiq", "Shirin"].map((name) => db.user.create({ data: { name, email: `${name.toLowerCase()}-${suffix}@test.local`, role: "PASSENGER", passwordHash: "test-only" } })));
    const vehicle = await db.vehicle.create({ data: { driverId: driver.id, name: "Bullet", capacity: 3, isOnline: true } });
    fixture = { driverId: driver.id, passengerIds: passengers.map((person) => person.id), vehicleId: vehicle.id };
  });
  afterEach(async () => {
    if (!fixture) return;
    const ids = fixture.passengerIds;
    await db.rideEvent.deleteMany({ where: { request: { passengerId: { in: ids } } } });
    await db.membership.deleteMany({ where: { pool: { vehicleId: fixture.vehicleId } } });
    await db.rideRequest.deleteMany({ where: { passengerId: { in: ids } } });
    await db.pool.deleteMany({ where: { vehicleId: fixture.vehicleId } });
    await db.vehicle.delete({ where: { id: fixture.vehicleId } });
    await db.user.deleteMany({ where: { id: { in: [fixture.driverId, ...ids] } } });
    fixture = undefined;
  });

  it("pools Nusrat and Rafiq at their own fares and rejects overcapacity", async () => {
    const [nusrat, rafiq, shirin] = fixture!.passengerIds;
    const first = await createRequest(nusrat, "Banani", "Mohakhali", 1, "CASH");
    const second = await createRequest(rafiq, "Banani", "Gulshan", 1, "CASH");
    const tooMany = await createRequest(shirin, "Banani", "Gulshan", 2, "CASH");
    const poolId = await acceptRequest(fixture!.driverId, first.id);
    expect(await acceptRequest(fixture!.driverId, second.id)).toBe(poolId);
    expect((await db.rideRequest.findUniqueOrThrow({ where: { id: first.id } })).farePaisa).toBe(7600);
    expect((await db.rideRequest.findUniqueOrThrow({ where: { id: second.id } })).farePaisa).toBe(8800);
    await expect(acceptRequest(fixture!.driverId, tooMany.id)).rejects.toThrow("Not enough seats");
  });

  it("rejects invalid transitions and cancellation after departure", async () => {
    const first = await createRequest(fixture!.passengerIds[0], "Banani", "Mohakhali", 1, "CASH");
    const poolId = await acceptRequest(fixture!.driverId, first.id);
    await expect(advancePool(fixture!.driverId, poolId, "STARTED")).rejects.toThrow("Invalid trip transition");
    await advancePool(fixture!.driverId, poolId, "DRIVER_ARRIVED");
    await advancePool(fixture!.driverId, poolId, "STARTED");
    await expect(cancelRequest(fixture!.passengerIds[0], first.id)).rejects.toThrow("can no longer be cancelled");
    await advancePool(fixture!.driverId, poolId, "COMPLETED");
  });

  it("keeps another passenger's ride private", async () => {
    const first = await createRequest(fixture!.passengerIds[0], "Banani", "Mohakhali", 1, "CASH");
    expect(await getPassengerRide(fixture!.passengerIds[1], first.id)).toBeNull();
    await expect(cancelRequest(fixture!.passengerIds[1], first.id)).rejects.toThrow("Ride not found");
  });

  it("releases a cancelled seat and restores the remaining solo fare", async () => {
    const [nusrat, rafiq] = fixture!.passengerIds;
    const first = await createRequest(nusrat, "Banani", "Mohakhali", 1, "CASH");
    const second = await createRequest(rafiq, "Banani", "Gulshan", 1, "CASH");
    const poolId = await acceptRequest(fixture!.driverId, first.id);
    await acceptRequest(fixture!.driverId, second.id);
    await cancelRequest(rafiq, second.id);
    expect((await db.rideRequest.findUniqueOrThrow({ where: { id: first.id } })).farePaisa).toBe(9500);
    expect((await db.rideRequest.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("CANCELLED");
    expect(await db.membership.count({ where: { poolId, request: { status: { not: "CANCELLED" } } } })).toBe(1);
  });

  it("serializes two simultaneous claims for Bullet's last seat", async () => {
    const [nusrat, rafiq, shirin] = fixture!.passengerIds;
    const first = await createRequest(nusrat, "Banani", "Mohakhali", 2, "CASH");
    const rafiqRide = await createRequest(rafiq, "Banani", "Gulshan", 1, "CASH");
    const shirinRide = await createRequest(shirin, "Banani", "Gulshan", 1, "CASH");
    const poolId = await acceptRequest(fixture!.driverId, first.id);
    const claims = await Promise.allSettled([acceptRequest(fixture!.driverId, rafiqRide.id), acceptRequest(fixture!.driverId, shirinRide.id)]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((result) => result.status === "rejected")).toHaveLength(1);
    const members = await db.membership.findMany({ where: { poolId, request: { status: { not: "CANCELLED" } } } });
    expect(members.reduce((seats, member) => seats + member.seats, 0)).toBe(3);
  });
});
