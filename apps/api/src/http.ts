import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function asyncRoute(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next); };
}

export function errors(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) return res.status(400).json({ error: "Invalid input", details: error.flatten() });
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error && typeof error === "object" && "code" in error && error.code === "P2002")
    return res.status(409).json({ error: "This record already exists" });
  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
}
