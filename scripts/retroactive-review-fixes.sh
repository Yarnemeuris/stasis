#!/usr/bin/env bash
#
# Retroactively corrects two review-data bugs that were just fixed in code:
#
#   (1) submission_review.grantOverride was auto-populated with ceil(BOM cost)
#       on non-admin first-pass DESIGN reviews, making it look like the reviewer
#       had explicitly set a grant override when they hadn't.
#
#   (2) project_review_action.reviewerId was attributed to the first-pass
#       reviewer when an admin approved "as-is", making reviewers look like
#       they'd finalized approvals they never had authority to finalize.
#
# Scope:
#   Fix 1 only nulls rows where grantOverride == ceil(current BOM). Rows that
#   differ are treated as explicit reviewer choices and left untouched.
#   Fix 2 only touches the most-recent APPROVED action per project+stage, so
#   older actions from approve/de-approve cycles are not rewritten.
#
# Usage:
#   DATABASE_URL='postgres://…prod-writable…' bash scripts/retroactive-review-fixes.sh
#   DATABASE_URL='postgres://…prod-writable…' bash scripts/retroactive-review-fixes.sh --apply
#
# Without --apply this is a dry run: the transaction is rolled back and only
# diagnostics are printed. Pass --apply to COMMIT.

set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: set DATABASE_URL to a writable prod connection string." >&2
  exit 1
fi

MODE="dry-run"
TAIL_SQL="ROLLBACK;"
if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
  TAIL_SQL="COMMIT;"
fi

echo ">>> Mode: $MODE"
echo ">>> Target: $(psql "$DATABASE_URL" -tAc "SELECT current_database() || ' on ' || inet_server_addr()")"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
\set QUIET off
BEGIN;

\echo
\echo '===== BEFORE ====='

\echo
\echo '-- Fix 1: first-pass DESIGN submission_review rows with auto-filled grantOverride = ceil(BOM)'
WITH bom AS (
  SELECT p.id AS project_id,
    CEIL(
      COALESCE((SELECT SUM("totalCost") FROM bom_item WHERE "projectId" = p.id AND status IN ('approved','pending')),0)
      + COALESCE(p."bomTax",0) + COALESCE(p."bomShipping",0)
    )::double precision AS ceil_bom
  FROM project p
)
SELECT COUNT(*) AS auto_fill_victims
FROM submission_review sr
JOIN project_submission ps ON ps.id = sr."submissionId"
JOIN bom ON bom.project_id = ps."projectId"
WHERE sr."isAdminReview" = false
  AND ps.stage = 'DESIGN'
  AND sr."grantOverride" IS NOT NULL
  AND sr."grantOverride"::double precision = bom.ceil_bom;

\echo
\echo '-- Fix 2: latest APPROVED project_review_action per project+stage attributed to first-pass reviewer'
WITH latest AS (
  SELECT DISTINCT ON ("projectId", stage) id, "projectId", stage, "reviewerId"
  FROM project_review_action
  WHERE decision = 'APPROVED'
  ORDER BY "projectId", stage, "createdAt" DESC
)
SELECT
  SUM(CASE WHEN l.stage = 'DESIGN' AND l."reviewerId" <> p."designReviewedBy" AND p."designReviewedBy" IS NOT NULL
           AND EXISTS (SELECT 1 FROM submission_review sr JOIN project_submission ps ON ps.id = sr."submissionId"
                       WHERE ps."projectId" = p.id AND ps.stage = 'DESIGN'
                         AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
                         AND sr."reviewerId" = l."reviewerId")
      THEN 1 ELSE 0 END) AS design_mislabeled,
  SUM(CASE WHEN l.stage = 'BUILD' AND l."reviewerId" <> p."buildReviewedBy" AND p."buildReviewedBy" IS NOT NULL
           AND EXISTS (SELECT 1 FROM submission_review sr JOIN project_submission ps ON ps.id = sr."submissionId"
                       WHERE ps."projectId" = p.id AND ps.stage = 'BUILD'
                         AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
                         AND sr."reviewerId" = l."reviewerId")
      THEN 1 ELSE 0 END) AS build_mislabeled
FROM latest l
JOIN project p ON p.id = l."projectId";

\echo
\echo '===== APPLYING FIXES ====='

-- Fix 1: null out auto-filled grantOverride on first-pass design reviews.
WITH bom AS (
  SELECT p.id AS project_id,
    CEIL(
      COALESCE((SELECT SUM("totalCost") FROM bom_item WHERE "projectId" = p.id AND status IN ('approved','pending')),0)
      + COALESCE(p."bomTax",0) + COALESCE(p."bomShipping",0)
    )::double precision AS ceil_bom
  FROM project p
),
targets AS (
  SELECT sr.id
  FROM submission_review sr
  JOIN project_submission ps ON ps.id = sr."submissionId"
  JOIN bom ON bom.project_id = ps."projectId"
  WHERE sr."isAdminReview" = false
    AND ps.stage = 'DESIGN'
    AND sr."grantOverride" IS NOT NULL
    AND sr."grantOverride"::double precision = bom.ceil_bom
)
UPDATE submission_review sr
SET "grantOverride" = NULL
FROM targets t
WHERE sr.id = t.id;

\echo '-- Fix 1 rows updated (above).'

-- Fix 2 (DESIGN): rewrite latest APPROVED action's reviewerId to the actual admin
-- who stamped project.designReviewedBy, scoped to rows where the current
-- reviewerId matches a non-admin first-pass SubmissionReview.
WITH latest AS (
  SELECT DISTINCT ON ("projectId", stage) id, "projectId", stage, "reviewerId"
  FROM project_review_action
  WHERE decision = 'APPROVED'
  ORDER BY "projectId", stage, "createdAt" DESC
),
targets AS (
  SELECT l.id, p."designReviewedBy" AS new_reviewer
  FROM latest l
  JOIN project p ON p.id = l."projectId"
  WHERE l.stage = 'DESIGN'
    AND p."designReviewedBy" IS NOT NULL
    AND l."reviewerId" <> p."designReviewedBy"
    AND EXISTS (
      SELECT 1 FROM submission_review sr
      JOIN project_submission ps ON ps.id = sr."submissionId"
      WHERE ps."projectId" = p.id AND ps.stage = 'DESIGN'
        AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
        AND sr."reviewerId" = l."reviewerId"
    )
    AND EXISTS (
      SELECT 1 FROM user_role ur
      WHERE ur."userId" = p."designReviewedBy" AND ur.role = 'ADMIN'
    )
)
UPDATE project_review_action pra
SET "reviewerId" = t.new_reviewer
FROM targets t
WHERE pra.id = t.id;

\echo '-- Fix 2 (DESIGN) rows updated (above).'

-- Fix 2 (BUILD): same logic against buildReviewedBy.
WITH latest AS (
  SELECT DISTINCT ON ("projectId", stage) id, "projectId", stage, "reviewerId"
  FROM project_review_action
  WHERE decision = 'APPROVED'
  ORDER BY "projectId", stage, "createdAt" DESC
),
targets AS (
  SELECT l.id, p."buildReviewedBy" AS new_reviewer
  FROM latest l
  JOIN project p ON p.id = l."projectId"
  WHERE l.stage = 'BUILD'
    AND p."buildReviewedBy" IS NOT NULL
    AND l."reviewerId" <> p."buildReviewedBy"
    AND EXISTS (
      SELECT 1 FROM submission_review sr
      JOIN project_submission ps ON ps.id = sr."submissionId"
      WHERE ps."projectId" = p.id AND ps.stage = 'BUILD'
        AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
        AND sr."reviewerId" = l."reviewerId"
    )
    AND EXISTS (
      SELECT 1 FROM user_role ur
      WHERE ur."userId" = p."buildReviewedBy" AND ur.role = 'ADMIN'
    )
)
UPDATE project_review_action pra
SET "reviewerId" = t.new_reviewer
FROM targets t
WHERE pra.id = t.id;

\echo '-- Fix 2 (BUILD) rows updated (above).'

\echo
\echo '===== AFTER ====='

\echo
\echo '-- Remaining auto-fill victims (expect 0):'
WITH bom AS (
  SELECT p.id AS project_id,
    CEIL(
      COALESCE((SELECT SUM("totalCost") FROM bom_item WHERE "projectId" = p.id AND status IN ('approved','pending')),0)
      + COALESCE(p."bomTax",0) + COALESCE(p."bomShipping",0)
    )::double precision AS ceil_bom
  FROM project p
)
SELECT COUNT(*) AS auto_fill_victims_remaining
FROM submission_review sr
JOIN project_submission ps ON ps.id = sr."submissionId"
JOIN bom ON bom.project_id = ps."projectId"
WHERE sr."isAdminReview" = false
  AND ps.stage = 'DESIGN'
  AND sr."grantOverride" IS NOT NULL
  AND sr."grantOverride"::double precision = bom.ceil_bom;

\echo
\echo '-- Remaining mislabeled latest approvals (expect 0):'
WITH latest AS (
  SELECT DISTINCT ON ("projectId", stage) id, "projectId", stage, "reviewerId"
  FROM project_review_action
  WHERE decision = 'APPROVED'
  ORDER BY "projectId", stage, "createdAt" DESC
)
SELECT
  SUM(CASE WHEN l.stage = 'DESIGN' AND l."reviewerId" <> p."designReviewedBy" AND p."designReviewedBy" IS NOT NULL
           AND EXISTS (SELECT 1 FROM submission_review sr JOIN project_submission ps ON ps.id = sr."submissionId"
                       WHERE ps."projectId" = p.id AND ps.stage = 'DESIGN'
                         AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
                         AND sr."reviewerId" = l."reviewerId")
      THEN 1 ELSE 0 END) AS design_mislabeled_remaining,
  SUM(CASE WHEN l.stage = 'BUILD' AND l."reviewerId" <> p."buildReviewedBy" AND p."buildReviewedBy" IS NOT NULL
           AND EXISTS (SELECT 1 FROM submission_review sr JOIN project_submission ps ON ps.id = sr."submissionId"
                       WHERE ps."projectId" = p.id AND ps.stage = 'BUILD'
                         AND sr."isAdminReview" = false AND sr.result = 'APPROVED'
                         AND sr."reviewerId" = l."reviewerId")
      THEN 1 ELSE 0 END) AS build_mislabeled_remaining
FROM latest l
JOIN project p ON p.id = l."projectId";

\echo
$TAIL_SQL
SQL

if [[ "$MODE" == "dry-run" ]]; then
  echo
  echo ">>> Dry run complete (ROLLBACK). Re-run with --apply to persist."
else
  echo
  echo ">>> Applied (COMMIT)."
fi
