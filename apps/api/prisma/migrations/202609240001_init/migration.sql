-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PASSENGER', 'DRIVER');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoolStatus" AS ENUM ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TESLAPAY');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "driverId" UUID NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideRequest" (
    "id" UUID NOT NULL,
    "passengerId" UUID NOT NULL,
    "pickup" VARCHAR(50) NOT NULL,
    "destination" VARCHAR(50) NOT NULL,
    "seats" INTEGER NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "farePaisa" INTEGER NOT NULL,
    "payment" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" UUID NOT NULL,
    "vehicleId" UUID NOT NULL,
    "status" "PoolStatus" NOT NULL DEFAULT 'ACCEPTED',
    "pickup" VARCHAR(50) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "poolId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "seats" INTEGER NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "from" "RequestStatus",
    "to" "RequestStatus" NOT NULL,
    "note" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_driverId_key" ON "Vehicle"("driverId");

-- CreateIndex
CREATE INDEX "Vehicle_isOnline_idx" ON "Vehicle"("isOnline");

-- CreateIndex
CREATE INDEX "RideRequest_status_pickup_createdAt_idx" ON "RideRequest"("status", "pickup", "createdAt");

-- CreateIndex
CREATE INDEX "RideRequest_passengerId_createdAt_idx" ON "RideRequest"("passengerId", "createdAt");

-- CreateIndex
CREATE INDEX "Pool_vehicleId_status_idx" ON "Pool"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "Pool_status_pickup_idx" ON "Pool"("status", "pickup");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_requestId_key" ON "Membership"("requestId");

-- CreateIndex
CREATE INDEX "Membership_poolId_idx" ON "Membership"("poolId");

-- CreateIndex
CREATE INDEX "RideEvent_requestId_createdAt_idx" ON "RideEvent"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideEvent" ADD CONSTRAINT "RideEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "RideRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideEvent" ADD CONSTRAINT "RideEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level guardrails complement the serialized capacity check in the API.
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_capacity_check" CHECK ("capacity" BETWEEN 1 AND 3);
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_seats_check" CHECK ("seats" BETWEEN 1 AND 3);
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_fare_check" CHECK ("farePaisa" >= 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_seats_check" CHECK ("seats" BETWEEN 1 AND 3);
CREATE UNIQUE INDEX "Pool_one_active_per_vehicle" ON "Pool"("vehicleId")
  WHERE "status" IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED');

