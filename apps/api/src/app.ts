import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import { db } from "./db.js";
import { AREAS, farePaisa } from "./domain.js";
import { authenticate, createPassenger, requireRole, setSession, verifyLogin } from "./auth.js";
import { asyncRoute, errors, HttpError } from "./http.js";
import { acceptRequest, advancePool, cancelPool, cancelRequest, createRequest, getPassengerRide, listPassengerRides, setDriverOnline } from "./rides.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000", credentials: true }));
app.use((req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && req.headers.origin !== (process.env.WEB_ORIGIN || "http://localhost:3000"))
    return next(new HttpError(403, "Origin not allowed"));
  next();
});

const uuid = z.string().uuid();
const credentials = z.object({ email: z.string().email().max(255), password: z.string().min(8).max(72) });
const signup = credentials.extend({ name: z.string().trim().min(2).max(80) });
const requestInput = z.object({
  pickup: z.enum(AREAS), destination: z.enum(AREAS),
  seats: z.number().int().min(1).max(3), payment: z.enum(["CASH", "TESLAPAY"]).default("CASH")
}).refine((input) => input.pickup !== input.destination, { message: "Choose a different destination", path: ["destination"] });

app.get("/api/health", asyncRoute(async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
}));
app.get("/api/areas", (_req, res) => res.json(AREAS));

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const input = signup.parse(req.body);
  const user = await createPassenger(input.name, input.email, input.password);
  setSession(res, user);
  res.status(201).json(user);
}));
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await verifyLogin(input.email, input.password);
  setSession(res, user);
  res.json(user);
}));
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("tesla_session", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" });
  res.status(204).end();
});
app.get("/api/me", authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.principal!.id }, select: { id: true, name: true, email: true, role: true } });
  if (!user) throw new HttpError(401, "Account no longer exists");
  res.json(user);
}));

app.post("/api/requests/estimate", authenticate, requireRole("PASSENGER"), (req, res) => {
  const input = requestInput.parse(req.body);
  res.json({ farePaisa: farePaisa(input.pickup, input.destination, input.seats, false), pooledFarePaisa: farePaisa(input.pickup, input.destination, input.seats, true) });
});
app.post("/api/requests", authenticate, requireRole("PASSENGER"), asyncRoute(async (req, res) => {
  const input = requestInput.parse(req.body);
  const ride = await createRequest(req.principal!.id, input.pickup, input.destination, input.seats, input.payment);
  res.status(201).json(ride);
}));
app.get("/api/requests", authenticate, requireRole("PASSENGER"), asyncRoute(async (req, res) => {
  res.json(await listPassengerRides(req.principal!.id));
}));
app.get("/api/requests/:id", authenticate, requireRole("PASSENGER"), asyncRoute(async (req, res) => {
  const ride = await getPassengerRide(req.principal!.id, uuid.parse(req.params.id));
  if (!ride) throw new HttpError(404, "Ride not found");
  res.json(ride);
}));
app.post("/api/requests/:id/cancel", authenticate, requireRole("PASSENGER"), asyncRoute(async (req, res) => {
  await cancelRequest(req.principal!.id, uuid.parse(req.params.id));
  res.status(204).end();
}));

app.get("/api/driver/dashboard", authenticate, requireRole("DRIVER"), asyncRoute(async (req, res) => {
  const vehicle = await db.vehicle.findUnique({ where: { driverId: req.principal!.id } });
  if (!vehicle) throw new HttpError(404, "No Tesla assigned");
  const [pending, pools] = await Promise.all([
    db.rideRequest.findMany({ where: { status: "REQUESTED", seats: { lte: vehicle.capacity } }, select: { id: true, pickup: true, destination: true, seats: true, farePaisa: true, createdAt: true, passenger: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 30 }),
    db.pool.findMany({ where: { vehicleId: vehicle.id }, include: { memberships: { include: { request: { select: { id: true, pickup: true, destination: true, seats: true, status: true, farePaisa: true, payment: true, passenger: { select: { name: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);
  res.json({ vehicle, pending, pools });
}));
app.patch("/api/driver/online", authenticate, requireRole("DRIVER"), asyncRoute(async (req, res) => {
  const { online } = z.object({ online: z.boolean() }).parse(req.body);
  res.json(await setDriverOnline(req.principal!.id, online));
}));
app.post("/api/driver/requests/:id/accept", authenticate, requireRole("DRIVER"), asyncRoute(async (req, res) => {
  const poolId = await acceptRequest(req.principal!.id, uuid.parse(req.params.id));
  res.json({ poolId });
}));
app.post("/api/driver/pools/:id/advance", authenticate, requireRole("DRIVER"), asyncRoute(async (req, res) => {
  const { next } = z.object({ next: z.enum(["DRIVER_ARRIVED", "STARTED", "COMPLETED"]) }).parse(req.body);
  await advancePool(req.principal!.id, uuid.parse(req.params.id), next);
  res.status(204).end();
}));
app.post("/api/driver/pools/:id/cancel", authenticate, requireRole("DRIVER"), asyncRoute(async (req, res) => {
  await cancelPool(req.principal!.id, uuid.parse(req.params.id));
  res.status(204).end();
}));

app.use((_req, _res, next) => next(new HttpError(404, "Endpoint not found")));
app.use(errors);
