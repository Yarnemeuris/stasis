-- CreateEnum
CREATE TYPE "ShopOrderStatus" AS ENUM ('PENDING', 'ON_HOLD', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_HOLD';
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_UNHOLD';
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_REJECT';
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_FULFILL';
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_REVERT';
ALTER TYPE "AuditAction" ADD VALUE 'SHOP_ORDER_NOTE_ADD';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CurrencyTransactionType" ADD VALUE 'SHOP_REFUND';
ALTER TYPE "CurrencyTransactionType" ADD VALUE 'SHOP_REFUND_REVERSED';

-- AlterTable
ALTER TABLE "currency_transaction" ADD COLUMN     "shopOrderId" TEXT;

-- CreateTable
CREATE TABLE "shop_order" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "shopItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitBitsCost" INTEGER NOT NULL,
    "totalBitsCost" INTEGER NOT NULL,
    "estimatedUsdCents" INTEGER NOT NULL,
    "fulfillmentUsdCents" INTEGER,
    "status" "ShopOrderStatus" NOT NULL DEFAULT 'PENDING',
    "trackingNumber" TEXT,
    "trackingCarrier" TEXT,
    "holdReason" TEXT,
    "rejectionReason" TEXT,
    "encryptedPhone" TEXT NOT NULL DEFAULT '',
    "encryptedAddress" TEXT NOT NULL DEFAULT '',
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heldAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "lastActorId" TEXT,

    CONSTRAINT "shop_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_note" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shop_order_orderNumber_key" ON "shop_order"("orderNumber");

-- CreateIndex
CREATE INDEX "shop_order_userId_idx" ON "shop_order"("userId");

-- CreateIndex
CREATE INDEX "shop_order_status_idx" ON "shop_order"("status");

-- CreateIndex
CREATE INDEX "shop_order_placedAt_idx" ON "shop_order"("placedAt");

-- CreateIndex
CREATE INDEX "shop_order_shopItemId_idx" ON "shop_order"("shopItemId");

-- CreateIndex
CREATE INDEX "shop_order_note_orderId_idx" ON "shop_order_note"("orderId");

-- CreateIndex
CREATE INDEX "currency_transaction_shopOrderId_idx" ON "currency_transaction"("shopOrderId");

-- AddForeignKey
ALTER TABLE "currency_transaction" ADD CONSTRAINT "currency_transaction_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "shop_order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order" ADD CONSTRAINT "shop_order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order" ADD CONSTRAINT "shop_order_shopItemId_fkey" FOREIGN KEY ("shopItemId") REFERENCES "shop_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_note" ADD CONSTRAINT "shop_order_note_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_note" ADD CONSTRAINT "shop_order_note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: convert existing SHOP_PURCHASE ledger rows that reference a DB shop_item
-- into ShopOrder rows (one ShopOrder per ledger row, quantity=1). Hardcoded items
-- (Event Invite / Flight Stipend / Accommodation) have no row in shop_item, so the
-- JOIN below naturally excludes them.
DO $$
DECLARE
  r RECORD;
  new_order_id TEXT;
BEGIN
  FOR r IN
    SELECT ct.id AS tx_id,
           ct."userId" AS user_id,
           ct."shopItemId" AS shop_item_id,
           ABS(ct.amount) AS bits_cost,
           ct."createdAt" AS placed_at,
           ct."fulfilledAt" AS fulfilled_at
      FROM currency_transaction ct
      JOIN shop_item si ON si.id = ct."shopItemId"
     WHERE ct.type = 'SHOP_PURCHASE'
       AND ct."shopOrderId" IS NULL
  LOOP
    new_order_id := 'bf_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO shop_order (
      id, "userId", "shopItemId", quantity, "unitBitsCost", "totalBitsCost",
      "estimatedUsdCents", status, "encryptedPhone", "encryptedAddress",
      "placedAt", "fulfilledAt"
    ) VALUES (
      new_order_id,
      r.user_id,
      r.shop_item_id,
      1,
      r.bits_cost,
      r.bits_cost,
      r.bits_cost * 50,
      CASE WHEN r.fulfilled_at IS NULL THEN 'PENDING'::"ShopOrderStatus"
           ELSE 'FULFILLED'::"ShopOrderStatus" END,
      '',
      '',
      r.placed_at,
      r.fulfilled_at
    );
    UPDATE currency_transaction SET "shopOrderId" = new_order_id WHERE id = r.tx_id;
  END LOOP;
END $$;
