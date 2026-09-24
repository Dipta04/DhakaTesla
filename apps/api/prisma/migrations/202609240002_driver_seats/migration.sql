-- Existing three-seat vehicles remain valid. New drivers may register 3-5 seats.
ALTER TABLE "Vehicle" DROP CONSTRAINT "Vehicle_capacity_check";
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_capacity_check" CHECK ("capacity" BETWEEN 3 AND 5);

-- A passenger may reserve up to the largest supported vehicle capacity.
ALTER TABLE "RideRequest" DROP CONSTRAINT "RideRequest_seats_check";
ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_seats_check" CHECK ("seats" BETWEEN 1 AND 5);
ALTER TABLE "Membership" DROP CONSTRAINT "Membership_seats_check";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_seats_check" CHECK ("seats" BETWEEN 1 AND 5);
