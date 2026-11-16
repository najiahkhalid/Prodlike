-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN     "authorId" TEXT,
ADD COLUMN     "basedOn" TEXT;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
