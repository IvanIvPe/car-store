/*
  Warnings:

  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `order` ADD COLUMN `ratedAt` DATETIME(3) NULL,
    ADD COLUMN `rating` TINYINT NULL,
    ADD COLUMN `ratingComment` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `favoriteFuel` ENUM('Petrol', 'Diesel', 'Hybrid', 'Electric') NULL,
    ADD COLUMN `phone` VARCHAR(32) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;
