"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const cars_json_1 = __importDefault(require("./seed-data/cars.json"));
const prisma = new client_1.PrismaClient();
console.log("👉 JSON:", cars_json_1.default);
console.log("👉 Broj auta:", cars_json_1.default.length);
async function main() {
    for (const c of cars_json_1.default) {
        const year = parseInt(c.year);
        const price = parseInt(c.price);
        const mileage = parseInt(c.mileage);
        await prisma.car.create({
            data: {
                make: c.make,
                model: c.model,
                year: year,
                price: price,
                color: c.color ?? null,
                mileage: mileage,
                fuel: c.fuel,
                image: c.image ?? ''
            }
        });
    }
}
main()
    .then(() => {
    console.log('Seed data injected');
})
    .catch((e) => {
    console.error('Error:', e);
})
    .finally(async () => {
    await prisma.$disconnect();
});
