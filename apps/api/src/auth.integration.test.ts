import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { app } from "./app.js";
import { db } from "./db.js";

const run = !!process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL && process.env.TEST_DATABASE_URL.includes("_test");
const suffix = randomUUID();
const created: string[] = [];
let server: Server;
let baseUrl: string;

describe.skipIf(!run)("account registration in PostgreSQL", () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret-at-least-32-characters";
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await db.vehicle.deleteMany({ where: { driverId: { in: created } } });
    await db.user.deleteMany({ where: { id: { in: created } } });
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  async function signup(role: "PASSENGER" | "DRIVER", capacity?: number) {
    return fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Driver", email: `${role.toLowerCase()}-${capacity ?? "none"}-${suffix}@test.local`, password: "StrongPass123!", role, vehicleName: "City Comet", capacity })
    });
  }

  it("rejects driver vehicles outside the three-to-five seat range", async () => {
    expect((await signup("DRIVER", 2)).status).toBe(400);
    expect((await signup("DRIVER", 6)).status).toBe(400);
  });

  it("creates a driver and their vehicle atomically", async () => {
    for (const capacity of [3, 5]) {
      const response = await signup("DRIVER", capacity);
      expect(response.status).toBe(201);
      const user = await response.json() as { id: string; role: string };
      created.push(user.id);
      expect(user.role).toBe("DRIVER");
      const vehicle = await db.vehicle.findUniqueOrThrow({ where: { driverId: user.id } });
      expect(vehicle.capacity).toBe(capacity);
      expect(vehicle.name).toBe("City Comet");
      expect(vehicle.isOnline).toBe(false);
    }
  });

  it("still allows a passenger without a vehicle", async () => {
    const response = await signup("PASSENGER");
    expect(response.status).toBe(201);
    const user = await response.json() as { id: string; role: string };
    created.push(user.id);
    expect(user.role).toBe("PASSENGER");
    expect(await db.vehicle.findUnique({ where: { driverId: user.id } })).toBeNull();
  });
});
