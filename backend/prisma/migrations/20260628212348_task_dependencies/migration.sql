-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "mppUid" INTEGER;

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "successorId" TEXT NOT NULL,
    "predecessorId" TEXT NOT NULL,
    "type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lagDays" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskDependency_successorId_idx" ON "TaskDependency"("successorId");

-- CreateIndex
CREATE INDEX "TaskDependency_predecessorId_idx" ON "TaskDependency"("predecessorId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_successorId_predecessorId_key" ON "TaskDependency"("successorId", "predecessorId");

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_successorId_fkey" FOREIGN KEY ("successorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_predecessorId_fkey" FOREIGN KEY ("predecessorId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
