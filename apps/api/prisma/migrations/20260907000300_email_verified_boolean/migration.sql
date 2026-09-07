-- BetterAuth espera emailVerified Boolean, não emailVerifiedAt DateTime
ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerifiedAt";
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
