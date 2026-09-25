import { PaymentMethod, PoolStatus, Prisma, RequestStatus } from "@prisma/client";
import { db } from "./db.js";
import { Area, compatible, fareBreakdown, nextPoolStatus } from "./domain.js";
import { HttpError } from "./http.js";

const activePoolStates: PoolStatus[] = ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"];
const passengerView = {
  id: true, pickup: true, destination: true, seats: true, status: true,
  baseFarePaisa: true, distanceChargePaisa: true, poolDiscountPaisa: true,
  farePaisa: true, payment: true, createdAt: true, updatedAt: true,
  membership: { select: { pool: { select: { id: true, status: true, vehicle: { select: { name: true, driver: { select: { name: true, phone: true } } } } } } } },
  events: { orderBy: { createdAt: "asc" as const }, select: { from: true, to: true, note: true, createdAt: true } }
};

async function event(tx: Prisma.TransactionClient, requestId: string, actorId: string, from: RequestStatus | null, to: RequestStatus, note?: string) {
  await tx.rideEvent.create({ data: { requestId, actorId, from, to, note } });
}

async function lockVehicle(tx: Prisma.TransactionClient, vehicleId: string) {
  await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${vehicleId}::uuid FOR UPDATE`;
}

async function reprice(tx: Prisma.TransactionClient, poolId: string) {
  const members = await tx.membership.findMany({ where: { poolId, request: { status: { not: "CANCELLED" } } }, include: { request: true } });
  const pooled = members.length >= 2;
  for (const { request } of members) {
    const { distanceKm: _distanceKm, ...fare } = fareBreakdown(request.pickup as Area, request.destination as Area, request.seats, pooled);
    await tx.rideRequest.update({ where: { id: request.id }, data: fare });
  }
  return members;
}

export async function createRequest(passengerId: string, pickup: Area, destination: Area, seats: number, payment: PaymentMethod) {
  return db.$transaction(async (tx) => {
    const passenger = await tx.user.findUnique({ where: { id: passengerId }, select: { phone: true } });
    if (!passenger?.phone) throw new HttpError(409, "Add a Bangladesh contact number before booking");
    const { distanceKm: _distanceKm, ...fare } = fareBreakdown(pickup, destination, seats, false);
    const request = await tx.rideRequest.create({ data: { passengerId, pickup, destination, seats, payment, ...fare } });
    await event(tx, request.id, passengerId, null, "REQUESTED", "Ride requested");
    return request;
  });
}

export async function acceptRequest(driverId: string, requestId: string) {
  return db.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({ where: { driverId } });
    if (!vehicle) throw new HttpError(404, "No Tesla assigned to this driver");
    await lockVehicle(tx, vehicle.id); // Serializes competing claims for this vehicle.
    const driver = await tx.user.findUnique({ where: { id: driverId }, select: { phone: true } });
    if (!driver?.phone) throw new HttpError(409, "Add your contact number before accepting rides");
    if (!(await tx.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).isOnline) throw new HttpError(409, "Go online before accepting rides");
    const request = await tx.rideRequest.findUnique({ where: { id: requestId } });
    if (!request || request.status !== "REQUESTED") throw new HttpError(409, "Request is no longer available");
    if (request.seats > vehicle.capacity) throw new HttpError(409, "Request exceeds Tesla capacity");

    let pool = await tx.pool.findFirst({ where: { vehicleId: vehicle.id, status: { in: activePoolStates } }, orderBy: { createdAt: "desc" } });
    if (pool) {
      if (pool.status !== "ACCEPTED") throw new HttpError(409, "This trip has already progressed");
      const members = await tx.membership.findMany({ where: { poolId: pool.id, request: { status: { not: "CANCELLED" } } }, include: { request: true } });
      if (members.some(({ request: existing }) => !compatible(existing, request))) throw new HttpError(409, "Route is incompatible with this pool");
      if (members.reduce((sum, member) => sum + member.seats, 0) + request.seats > vehicle.capacity) throw new HttpError(409, "Not enough seats remain");
    } else {
      pool = await tx.pool.create({ data: { vehicleId: vehicle.id, pickup: request.pickup } });
    }
    const claimed = await tx.rideRequest.updateMany({ where: { id: request.id, status: "REQUESTED" }, data: { status: "ACCEPTED" } });
    if (claimed.count !== 1) throw new HttpError(409, "Request is no longer available");
    await tx.membership.create({ data: { poolId: pool.id, requestId: request.id, seats: request.seats } });
    await event(tx, request.id, driverId, "REQUESTED", "ACCEPTED", `Assigned to ${vehicle.name}`);
    await reprice(tx, pool.id);
    return pool.id;
  }, { timeout: 10000 });
}

export async function cancelRequest(passengerId: string, requestId: string) {
  return db.$transaction(async (tx) => {
    const original = await tx.rideRequest.findUnique({ where: { id: requestId }, include: { membership: { include: { pool: true } } } });
    if (!original || original.passengerId !== passengerId) throw new HttpError(404, "Ride not found");
    if (!original.membership) {
      // A request being claimed at the same time will fail this compare-and-swap.
      // The passenger may retry after the claim commits, when the vehicle lock is known.
      const cancelled = await tx.rideRequest.updateMany({ where: { id: requestId, passengerId, status: "REQUESTED" }, data: { status: "CANCELLED" } });
      if (cancelled.count !== 1) throw new HttpError(409, "Ride changed; refresh and try again");
      await event(tx, requestId, passengerId, "REQUESTED", "CANCELLED", "Cancelled by passenger");
      return;
    }
    await lockVehicle(tx, original.membership.pool.vehicleId);
    const request = await tx.rideRequest.findUnique({ where: { id: requestId }, include: { membership: { include: { pool: true } } } });
    if (!request || !["ACCEPTED", "DRIVER_ARRIVED"].includes(request.status)) throw new HttpError(409, "This ride can no longer be cancelled");
    await tx.rideRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
    await event(tx, requestId, passengerId, request.status, "CANCELLED", "Cancelled by passenger");
    if (request.membership) {
      const members = await reprice(tx, request.membership.poolId);
      if (members.length === 0) await tx.pool.update({ where: { id: request.membership.poolId }, data: { status: "CANCELLED" } });
    }
  }, { timeout: 10000 });
}

export async function advancePool(driverId: string, poolId: string, next: PoolStatus) {
  return db.$transaction(async (tx) => {
    const pool = await tx.pool.findUnique({ where: { id: poolId }, include: { vehicle: true } });
    if (!pool || pool.vehicle.driverId !== driverId) throw new HttpError(404, "Pool not found");
    await lockVehicle(tx, pool.vehicleId);
    const current = await tx.pool.findUniqueOrThrow({ where: { id: poolId } });
    if (nextPoolStatus[current.status] !== next) throw new HttpError(409, "Invalid trip transition");
    const members = await tx.membership.findMany({ where: { poolId, request: { status: { not: "CANCELLED" } } }, include: { request: true } });
    if (members.length === 0) throw new HttpError(409, "A pool needs a passenger");
    await tx.pool.update({ where: { id: poolId }, data: { status: next } });
    const requestStatus = next as RequestStatus;
    for (const { request } of members) {
      await tx.rideRequest.update({ where: { id: request.id }, data: { status: requestStatus } });
      await event(tx, request.id, driverId, request.status, requestStatus);
    }
  }, { timeout: 10000 });
}

export async function cancelPool(driverId: string, poolId: string) {
  return db.$transaction(async (tx) => {
    const pool = await tx.pool.findUnique({ where: { id: poolId }, include: { vehicle: true } });
    if (!pool || pool.vehicle.driverId !== driverId) throw new HttpError(404, "Pool not found");
    await lockVehicle(tx, pool.vehicleId);
    const current = await tx.pool.findUniqueOrThrow({ where: { id: poolId } });
    if (!["ACCEPTED", "DRIVER_ARRIVED"].includes(current.status)) throw new HttpError(409, "This pool can no longer be cancelled");
    await tx.pool.update({ where: { id: poolId }, data: { status: "CANCELLED" } });
    const members = await tx.membership.findMany({ where: { poolId, request: { status: { not: "CANCELLED" } } }, include: { request: true } });
    for (const { request } of members) {
      await tx.rideRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
      await event(tx, request.id, driverId, request.status, "CANCELLED", "Cancelled by driver");
    }
  });
}

export function listPassengerRides(passengerId: string) {
  return db.rideRequest.findMany({ where: { passengerId }, select: passengerView, orderBy: { createdAt: "desc" } });
}

export function getPassengerRide(passengerId: string, id: string) {
  return db.rideRequest.findFirst({ where: { id, passengerId }, select: passengerView });
}

export function setDriverOnline(driverId: string, online: boolean) {
  return db.$transaction(async (tx) => {
    const vehicle = await tx.vehicle.findUnique({ where: { driverId } });
    if (!vehicle) throw new HttpError(404, "No Tesla assigned");
    await lockVehicle(tx, vehicle.id);
    if (online && !(await tx.user.findUnique({ where: { id: driverId }, select: { phone: true } }))?.phone)
      throw new HttpError(409, "Add your contact number before going online");
    if (!online && await tx.pool.count({ where: { vehicleId: vehicle.id, status: { in: activePoolStates } } }))
      throw new HttpError(409, "Complete or cancel your active pool first");
    return tx.vehicle.update({ where: { id: vehicle.id }, data: { isOnline: online } });
  });
}
