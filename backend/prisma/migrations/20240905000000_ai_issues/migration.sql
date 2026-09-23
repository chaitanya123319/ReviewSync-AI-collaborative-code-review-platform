-- CreateTable: AiIssue for storing LLM-detected code issues
CREATE TABLE "AiIssue" (
    "id" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,

    CONSTRAINT "AiIssue_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiIssue" ADD CONSTRAINT "AiIssue_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ReviewFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
