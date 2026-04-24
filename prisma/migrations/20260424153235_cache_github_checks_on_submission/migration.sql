-- AlterTable
ALTER TABLE "project_submission" ADD COLUMN     "githubChecks" JSONB,
ADD COLUMN     "githubChecksAt" TIMESTAMP(3);
