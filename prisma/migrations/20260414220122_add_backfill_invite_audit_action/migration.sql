/*
  Warnings:

  - The values [SPOT_CHECK_VERDICT,SPOT_CHECK_VERDICT_CLEARED,SPOT_CHECK_TRUST_REVIEWER,SPOT_CHECK_UNTRUST_REVIEWER] on the enum `AuditAction` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `airtableRecordId` on the `project` table. All the data in the column will be lost.
  - You are about to drop the column `airtableJustification` on the `project_review_action` table. All the data in the column will be lost.
  - You are about to drop the `justification_spot_check` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `trusted_reviewer` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AuditAction_new" AS ENUM ('ADMIN_GRANT_ROLE', 'ADMIN_REVOKE_ROLE', 'ADMIN_FLAG_FRAUD', 'ADMIN_UNFLAG_FRAUD', 'ADMIN_APPROVE_DESIGN', 'ADMIN_REJECT_DESIGN', 'ADMIN_APPROVE_BUILD', 'ADMIN_REJECT_BUILD', 'ADMIN_UNAPPROVE_DESIGN', 'ADMIN_UNAPPROVE_BUILD', 'ADMIN_HIDE_PROJECT', 'ADMIN_UNHIDE_PROJECT', 'ADMIN_LOGOUT_ALL_USERS', 'ADMIN_REQUEST_UPDATE', 'ADMIN_REVIEW_SESSION', 'ADMIN_REVIEW_HACKATIME', 'ADMIN_APPROVE_BOM', 'ADMIN_REJECT_BOM', 'ADMIN_DELETE_PROJECT', 'ADMIN_UNDELETE_PROJECT', 'ADMIN_SET_EFFECTIVE_DATE', 'ADMIN_GRANT_STREAK_GRACE_DAY', 'ADMIN_REVOKE_STREAK_GRACE_DAY', 'ADMIN_BACKFILL_INVITE', 'REVIEWER_APPROVE', 'REVIEWER_RETURN', 'REVIEWER_REJECT', 'ADMIN_MOVE_QUEUE', 'ADMIN_PAY_REVIEWER', 'ADMIN_IMPERSONATE', 'SUPERADMIN_GRANT', 'USER_DELETE_PROJECT', 'USER_SUBMIT_PROJECT', 'USER_UNSUBMIT_PROJECT', 'INVENTORY_IMPORT', 'INVENTORY_ORDER_STATUS_UPDATE', 'INVENTORY_ORDER_CANCEL', 'INVENTORY_RENTAL_RETURN', 'INVENTORY_TEAM_LOCK', 'INVENTORY_SETTINGS_UPDATE', 'INVENTORY_ITEM_CREATE', 'INVENTORY_ITEM_UPDATE', 'INVENTORY_ITEM_DELETE', 'INVENTORY_TOOL_CREATE', 'INVENTORY_TOOL_UPDATE', 'INVENTORY_TOOL_DELETE', 'INVENTORY_BADGE_ASSIGN', 'INVENTORY_ORDER_PLACE', 'INVENTORY_ORDER_CANCEL_USER', 'INVENTORY_RENTAL_CREATE', 'INVENTORY_TEAM_CREATE', 'INVENTORY_TEAM_JOIN', 'INVENTORY_TEAM_LEAVE', 'INVENTORY_TEAM_DELETE', 'INVENTORY_TEAM_RENAME', 'INVENTORY_TEAM_KICK_MEMBER', 'INVENTORY_TEAM_ADD_MEMBER');
ALTER TABLE "audit_log" ALTER COLUMN "action" TYPE "AuditAction_new" USING ("action"::text::"AuditAction_new");
ALTER TYPE "AuditAction" RENAME TO "AuditAction_old";
ALTER TYPE "AuditAction_new" RENAME TO "AuditAction";
DROP TYPE "public"."AuditAction_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "justification_spot_check" DROP CONSTRAINT "justification_spot_check_checkedById_fkey";

-- DropForeignKey
ALTER TABLE "justification_spot_check" DROP CONSTRAINT "justification_spot_check_projectReviewActionId_fkey";

-- DropForeignKey
ALTER TABLE "trusted_reviewer" DROP CONSTRAINT "trusted_reviewer_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "trusted_reviewer" DROP CONSTRAINT "trusted_reviewer_trustedById_fkey";

-- DropIndex
DROP INDEX "project_review_action_createdAt_idx";

-- DropIndex
DROP INDEX "project_review_action_reviewerId_idx";

-- AlterTable
ALTER TABLE "project" DROP COLUMN "airtableRecordId";

-- AlterTable
ALTER TABLE "project_review_action" DROP COLUMN "airtableJustification";

-- DropTable
DROP TABLE "justification_spot_check";

-- DropTable
DROP TABLE "trusted_reviewer";

-- DropEnum
DROP TYPE "SpotCheckVerdict";
