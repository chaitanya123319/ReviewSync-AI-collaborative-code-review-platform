-- CreateTable
CREATE TABLE "ReviewFile" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'plaintext',
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "ReviewFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineComment" (
    "id" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "LineComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ReviewFile" ADD CONSTRAINT "ReviewFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineComment" ADD CONSTRAINT "LineComment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ReviewFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineComment" ADD CONSTRAINT "LineComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
