import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { db } from "./db.js";
import { HttpError } from "./http.js";

export type Principal = { id: string; role: Role };
declare global { namespace Express { interface Request { principal?: Principal } } }

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must be at least 32 characters");
  return value;
};

export async function createPassenger(name: string, email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  return db.user.create({ data: { name, email: email.toLowerCase(), passwordHash, role: "PASSENGER" }, select: { id: true, name: true, email: true, role: true } });
}

export async function verifyLogin(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, "Invalid email or password");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function setSession(res: Response, user: Principal) {
  const token = jwt.sign(user, secret(), { expiresIn: "7d" });
  res.cookie("tesla_session", token, {
    httpOnly: true, secure: (process.env.WEB_ORIGIN || "").startsWith("https://"), sameSite: "lax", path: "/", maxAge: 7 * 86400000
  });
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.tesla_session;
    if (!token) throw new HttpError(401, "Please sign in");
    const payload = jwt.verify(token, secret());
    if (typeof payload !== "object" || typeof payload.id !== "string" || !["PASSENGER", "DRIVER"].includes(payload.role))
      throw new HttpError(401, "Invalid session");
    req.principal = { id: payload.id, role: payload.role as Role };
    next();
  } catch { next(new HttpError(401, "Please sign in again")); }
}

export function requireRole(role: Role) {
  return (req: Request, _res: Response, next: NextFunction) => req.principal?.role === role ? next() : next(new HttpError(403, "Forbidden"));
}
