-- CreateTable
CREATE TABLE `Cart` (
    `cartId` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `sessionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Cart_sessionId_key`(`sessionId`),
    INDEX `Cart_userId_idx`(`userId`),
    INDEX `Cart_sessionId_idx`(`sessionId`),
    PRIMARY KEY (`cartId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CartItem` (
    `cartItemId` INTEGER NOT NULL AUTO_INCREMENT,
    `cartId` INTEGER NOT NULL,
    `carId` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CartItem_carId_idx`(`carId`),
    INDEX `CartItem_cartId_idx`(`cartId`),
    UNIQUE INDEX `CartItem_cartId_carId_key`(`cartId`, `carId`),
    PRIMARY KEY (`cartItemId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cart` ADD CONSTRAINT `Cart_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `Cart`(`cartId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CartItem` ADD CONSTRAINT `CartItem_carId_fkey` FOREIGN KEY (`carId`) REFERENCES `Car`(`carId`) ON DELETE RESTRICT ON UPDATE CASCADE;
