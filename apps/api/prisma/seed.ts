import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { fareBreakdown } from "../src/domain.js";

const db = new PrismaClient();
const demoPassword = process.env.SEED_PASSWORD || "DemoPass123!";

async function main() {
  const passwordHash = await bcrypt.hash(demoPassword, 12);
  const people = [
    { name: "Jashim", email: "jashim@teslapool.test", role: "DRIVER" as const },
    { name: "Nusrat", email: "nusrat@teslapool.test", role: "PASSENGER" as const },
    { name: "Rafiq", email: "rafiq@teslapool.test", role: "PASSENGER" as const },
    { name: "Shirin", email: "shirin@teslapool.test", role: "PASSENGER" as const }
  ];
  const users = await Promise.all(people.map((person) => db.user.upsert({
    where: { email: person.email }, update: { name: person.name },
    create: { ...person, passwordHash }
  })));
  await db.vehicle.upsert({ where: { driverId: users[0].id }, update: { name: "Bullet", capacity: 3 }, create: { driverId: users[0].id, name: "Bullet", capacity: 3, isOnline: true } });
  for (const [passenger, destination] of [[users[1], "Mohakhali"], [users[2], "Gulshan"]] as const) {
    if (await db.rideRequest.count({ where: { passengerId: passenger.id } })) continue;
    const { distanceKm: _distanceKm, ...fare } = fareBreakdown("Banani", destination, 1, false);
    const ride = await db.rideRequest.create({ data: { passengerId: passenger.id, pickup: "Banani", destination, seats: 1, ...fare } });
    await db.rideEvent.create({ data: { requestId: ride.id, actorId: passenger.id, to: "REQUESTED", note: "Seeded Banani rush-hour request" } });
  }
  console.log("Seeded Jashim, Bullet, Nusrat, Rafiq, and Shirin.");
}

main().finally(() => db.$disconnect());
