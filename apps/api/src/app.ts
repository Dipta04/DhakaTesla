import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import * as helmet from "helmet";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bangladeshPhone } from "./phone.js";
import { db } from "./db.js";
import { AREAS, compatible, fareBreakdown } from "./domain.js";
import { authenticate, createAccount, requireRole, setSession, verifyLogin } from "./auth.js";
import { asyncRoute, errors, HttpError } from "./http.js";
import { acceptRequest, advancePool, cancelPool, cancelRequest, createRequest, getPassengerRide, listPassengerRides, setDriverOnline } from "./rides.js";

export const app = express();
app.disable("x-powered-by");
const helmetMiddleware = helmet.default as unknown as () => express.RequestHandler;
app.use(helmetMiddleware());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.use(cors({ origin: process.env.WEB_ORIGIN || "http://localhost:3000", credentials: true }));
app.use((req, res, next) => {
  const requestId = randomUUID();
  const started = Date.now();
  res.setHeader("x-request-id", requestId);
  res.on("finish", () => {
    if (req.path !== "/api/health") console.info(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started }));
  });
  next();
});
app.use((req, _res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && req.headers.origin !== (process.env.WEB_ORIGIN || "http://localhost:3000"))
    return next(new HttpError(403, "Origin not allowed"));
  next();
});

const uuid = z.string().uuid();
const credentials = z.object({ email: z.string().email().max(255), password: z.string().min(8).max(72) });
const signup = credentials.extend({
  name: z.string().trim().min(2).max(80),
  phone: bangladeshPhone,
  role: z.enum(["PASSENGER", "DRIVER"]),
  vehicleName: z.string().trim().min(2).max(80).optional(),
  capacity: z.number().int().min(3).max(5).optional()
}).superRefine((input, context) => {
  if (input.role === "DRIVER" && !input.vehicleName) context.addIssue({ code: "custom", path: ["vehicleName"], message: "Enter your vehicle name" });
  if (input.role === "DRIVER" && input.capacity === undefined) context.addIssue({ code: "custom", path: ["capacity"], message: "Choose 3 to 5 seats" });
});
const requestInput = z.object({
  pickup: z.enum(AREAS), destination: z.enum(AREAS),
  seats: z.number().int().min(1).max(5), payment: z.enum(["CASH", "TESLAPAY"]).default("CASH")
}).refine((input) => input.pickup !== input.destination, { message: "Choose a different destination", path: ["destination"] });

app.get("/api/health", asyncRoute(async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
}));
app.get("/api/areas", (_req, res) => res.json(AREAS));

app.post("/api/auth/signup", asyncRoute(async (req, res) => {
  const input = signup.parse(req.body);
  const user = await createAccount(input);
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
  res.clearCookie("tesla_session", { path: "/", sameSite: "lax", secure: (process.env.WEB_ORIGIN || "").startsWith("https://") });
  res.status(204).end();
});
app.get("/api/me", authenticate, asyncRoute(async (req, res) => {
  const user = await db.user.findUnique({ where: { id: req.principal!.id }, select: { id: true, name: true, email: true, phone: true, role: true } });
  if (!user) throw new HttpError(401, "Account no longer exists");
  res.json(user);
}));
app.patch("/api/me/phone", authenticate, asyncRoute(async (req, res) => {
  const { phone } = z.object({ phone: bangladeshPhone }).parse(req.body);
  res.json(await db.user.update({ where: { id: req.principal!.id }, data: { phone }, select: { id: true, name: true, email: true, phone: true, role: true } }));
}));

app.post("/api/requests/estimate", authenticate, requireRole("PASSENGER"), (req, res) => {
  const input = requestInput.parse(req.body);
  res.json({ solo: fareBreakdown(input.pickup, input.destination, input.seats, false), pooled: fareBreakdown(input.pickup, input.destination, input.seats, true) });
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
    db.pool.findMany({ where: { vehicleId: vehicle.id }, include: { memberships: { include: { request: { select: { id: true, pickup: true, destination: true, seats: true, status: true, baseFarePaisa: true, distanceChargePaisa: true, poolDiscountPaisa: true, farePaisa: true, payment: true, passenger: { select: { name: true, phone: true } } } } } } }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);
  const active = pools.find((pool) => ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"].includes(pool.status));
  const members = active?.memberships.filter(({ request }) => request.status !== "CANCELLED") || [];
  const remaining = vehicle.capacity - members.reduce((total, member) => total + member.seats, 0);
  const relevant = active
    ? active.status === "ACCEPTED" ? pending.filter((request) => request.seats <= remaining && members.every((member) => compatible(member.request, request))) : []
    : pending;
  const visiblePools = pools.map((pool) => ({
    ...pool,
    memberships: pool.memberships.map((membership) => ({
      ...membership,
      request: {
        ...membership.request,
        passenger: {
          ...membership.request.passenger,
          phone: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"].includes(pool.status) && membership.request.status !== "CANCELLED"
            ? membership.request.passenger.phone : null
        }
      }
    }))
  }));
  res.json({ vehicle, pending: relevant, pools: visiblePools });
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

export default app;
