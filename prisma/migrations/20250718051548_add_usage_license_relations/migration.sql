-- CreateTable
CREATE TABLE "usage_licenses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "scratchCardId" TEXT NOT NULL,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_licenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "usage_licenses" ADD CONSTRAINT "usage_licenses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_licenses" ADD CONSTRAINT "usage_licenses_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "licenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_licenses" ADD CONSTRAINT "usage_licenses_scratchCardId_fkey" FOREIGN KEY ("scratchCardId") REFERENCES "scratch_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
