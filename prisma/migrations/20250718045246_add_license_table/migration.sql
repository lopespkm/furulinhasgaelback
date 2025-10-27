-- CreateTable
CREATE TABLE "licenses" (
    "id" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "credits_value" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "ggr_percentage" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "total_earnings" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "licenses_pkey" PRIMARY KEY ("id")
);
