ALTER TABLE "RideRequest" ADD COLUMN "baseFarePaisa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RideRequest" ADD COLUMN "distanceChargePaisa" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RideRequest" ADD COLUMN "poolDiscountPaisa" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing demo rides from the original documented grid. Unknown
-- legacy zones retain their original total as the distance component.
WITH points(zone, x, y) AS (
  VALUES ('Banani',0,0), ('Gulshan',0,4), ('Mohakhali',3,0),
         ('Dhanmondi',7,-3), ('Mirpur',8,4), ('Uttara',-8,2),
         ('Farmgate',5,-1), ('Bashundhara',-2,7)
), components AS (
  SELECT r."id", r."farePaisa",
    CASE WHEN p.zone IS NULL OR d.zone IS NULL THEN 0 ELSE 5000 * r."seats" END AS base,
    CASE WHEN p.zone IS NULL OR d.zone IS NULL THEN r."farePaisa"
         ELSE 1500 * GREATEST(1, ROUND(SQRT(POWER(d.x-p.x,2) + POWER(d.y-p.y,2)))::integer) * r."seats"
    END AS distance
  FROM "RideRequest" r
  LEFT JOIN points p ON p.zone = r."pickup"
  LEFT JOIN points d ON d.zone = r."destination"
)
UPDATE "RideRequest" r SET
  "baseFarePaisa" = c.base,
  "distanceChargePaisa" = c.distance,
  "poolDiscountPaisa" = c.base + c.distance - c."farePaisa"
FROM components c WHERE r."id" = c."id";

ALTER TABLE "RideRequest" ADD CONSTRAINT "RideRequest_fare_components_check"
  CHECK ("baseFarePaisa" >= 0 AND "distanceChargePaisa" >= 0 AND
         "poolDiscountPaisa" >= 0 AND
         "farePaisa" = "baseFarePaisa" + "distanceChargePaisa" - "poolDiscountPaisa");
