-- CreateIndex
CREATE INDEX `Car_bodyType_fuel_idx` ON `Car`(`bodyType`, `fuel`);

-- CreateIndex
CREATE INDEX `Car_year_idx` ON `Car`(`year`);

-- CreateIndex
CREATE INDEX `Car_price_idx` ON `Car`(`price`);

-- CreateIndex
CREATE INDEX `Car_mileage_idx` ON `Car`(`mileage`);

-- RenameIndex
ALTER TABLE `orderitem` RENAME INDEX `OrderItem_carId_fkey` TO `OrderItem_carId_idx`;

-- RenameIndex
ALTER TABLE `orderitem` RENAME INDEX `OrderItem_orderId_fkey` TO `OrderItem_orderId_idx`;
