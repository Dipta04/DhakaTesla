-- Existing accounts must add a verified-format number through the profile flow.
ALTER TABLE "User" ADD COLUMN "phone" VARCHAR(14);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
ALTER TABLE "User" ADD CONSTRAINT "User_bd_phone_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^[+]8801[3-9][0-9]{8}$');
