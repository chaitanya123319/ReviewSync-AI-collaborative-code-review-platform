-- AlterTable: Add threading and resolution fields to LineComment
ALTER TABLE "LineComment" ADD COLUMN "parentCommentId" TEXT;
ALTER TABLE "LineComment" ADD COLUMN "resolved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LineComment" ADD COLUMN "resolvedAt" TIMESTAMP(3);
ALTER TABLE "LineComment" ADD COLUMN "resolvedById" TEXT;

-- AddForeignKey: self-relation for threaded comments
ALTER TABLE "LineComment" ADD CONSTRAINT "LineComment_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "LineComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: who resolved the comment
ALTER TABLE "LineComment" ADD CONSTRAINT "LineComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
