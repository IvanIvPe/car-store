-- CreateTable
CREATE TABLE `Car` (
    `carId` INTEGER NOT NULL AUTO_INCREMENT,
    `make` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `year` INTEGER NOT NULL,
    `price` INTEGER NOT NULL,
    `color` VARCHAR(191) NOT NULL,
    `mileage` INTEGER NOT NULL,
    `fuel` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`carId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
