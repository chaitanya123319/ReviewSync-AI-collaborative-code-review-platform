-- AlterTable: Add GitHub OAuth fields to User
ALTER TABLE "User" ADD COLUMN "githubId" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ALTER COLUMN "password" SET DEFAULT '';

-- CreateIndex: unique constraint on githubId
CREATE UNIQUE INDEX "User_githubId_key" ON "User"("githubId");
