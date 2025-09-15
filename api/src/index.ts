import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { PrismaClient, FuelType, BodyType } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.PORT || 3000);


const allowedOrigins = (process.env.CORS_ORIGIN ??
  'http://localhost:4200,http://127.0.0.1:4200'
).split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.use(express.json());


const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET nije postavljen u .env! Postavi JWT_SECRET.');
}
function signToken(u: { userId: number; role?: string }) {
  return jwt.sign(
    { userId: u.userId, role: (u.role || 'USER').toUpperCase() },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

declare global {
  namespace Express {
    interface Request { userId?: number; role?: string; }
  }
}


function attachUser(req: express.Request, _res: express.Response, next: express.NextFunction) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const token = h.slice(7);
      const payload = jwt.verify(token, JWT_SECRET) as any;
      req.userId = Number(payload.userId ?? payload.id);
      req.role = String(payload.role || 'USER').toUpperCase();
    } catch { /* ignore invalid token */ }
  }
  next();
}
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.userId) return res.status(401).json({ error: 'Unauthorized' });
  if ((req.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  next();
}
app.use(attachUser);


type Identity = { userId?: number; sessionId?: string | null };
function identityOf(req: express.Request, res: express.Response): Identity | null {
  const userId = req.userId;
  const sessionId = (req.header('x-session-id') ?? null) as string | null;
  if (!userId && !sessionId) {
    res.status(400).json({ error: 'Missing identity: provide Authorization Bearer token or x-session-id header' });
    return null;
  }
  return { userId, sessionId };
}


const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

function choosePhoto(photos: any[]): string | null {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  const first = photos[0];
  return first?.src?.large ?? first?.src?.medium ?? null;
}
async function findCarImage(make: string, model: string, year?: number): Promise<string | null> {
  if (!PEXELS_API_KEY) return null;
  const q = [make, model, year ? String(year) : '', 'car exterior front 3/4'].filter(Boolean).join(' ');
  try {
    const { data } = await axios.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: PEXELS_API_KEY },
      params: { query: q, per_page: 1, orientation: 'landscape', size: 'large' },
      timeout: 12000,
    });
    return choosePhoto(data?.photos) || null;
  } catch {
    return null;
  }
}

app.post('/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body as {
      email?: string; password?: string; fullName?: string;
    };
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });
    if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });

    const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash, fullName: fullName ?? null, role: 'USER' }
    });

    const token = signToken(user);
    res.status(201).json({
      token,
      user: { userId: user.userId, email: user.email, fullName: user.fullName, role: user.role }
    });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Registration failed' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: { userId: user.userId, email: user.email, fullName: user.fullName, role: user.role } });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Login failed' });
  }
});

app.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { userId: req.userId! },
    select: { userId: true, email: true, fullName: true, role: true }
  });
  res.json(user);
});


app.post('/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body || {};
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old and new password are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { userId: req.userId! } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(String(oldPassword), user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Old password is incorrect' });

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    const updated = await prisma.user.update({
      where: { userId: user.userId },
      data: { passwordHash }
    });

    const token = signToken(updated);
    res.json({ ok: true, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to change password' });
  }
});


app.get('/health', (_req, res) => res.json({ ok: true }));


app.get('/users/me', requireAuth, async (req, res) => {
  try {
    const me = await prisma.user.findUnique({
      where: { userId: req.userId! },
      select: {
        userId: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        favoriteFuel: true
      }
    });
    if (!me) return res.status(404).json({ error: 'User not found' });
    res.json(me);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

app.put('/users/me', requireAuth, async (req, res) => {
  try {
    const { fullName, phone, address, favoriteFuel } = req.body || {};
    const allowed = Object.values(FuelType);
    const fav: FuelType | null =
      allowed.includes(favoriteFuel) ? (favoriteFuel as FuelType) : null;

    const updated = await prisma.user.update({
      where: { userId: req.userId! },
      data: {
        fullName: fullName ?? null,
        phone: phone ?? null,
        address: address ?? null,
        favoriteFuel: fav
      },
      select: {
        userId: true,
        email: true,
        fullName: true,
        phone: true,
        address: true,
        favoriteFuel: true
      }
    });

    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to save profile' });
  }
});

app.get('/cars', async (_req, res) => {
  try {
    const cars = await prisma.car.findMany({ orderBy: { carId: 'asc' } });
    res.json(cars);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/cars/search', async (req, res) => {
  try {
    const {
      bodyType, fuel, make, model,
      maxPrice, minYear, maxMileage,
      sortBy = 'yearDesc',
      pageIndex = '0', pageSize = '20'
    } = req.query as Record<string, string>;

    const where: any = {};

    if (bodyType) {
      const allowedBody = Object.values(BodyType) as string[];
      const canon = allowedBody.find(v => v.toLowerCase() === String(bodyType).toLowerCase());
      if (canon) where.bodyType = canon as BodyType;
    }

    if (fuel) where.fuel = { equals: String(fuel) };
    if (make)  where.make  = { contains: String(make)  };
    if (model) where.model = { contains: String(model) };

    if (maxPrice)   where.price   = { lte: Number(maxPrice) };
    if (minYear)    where.year    = { gte: Number(minYear) };
    if (maxMileage) where.mileage = { lte: Number(maxMileage) };

    const sortMap: Record<string, any> = {
      yearDesc:   { year: 'desc' },
      yearAsc:    { year: 'asc'  },
      priceAsc:   { price: 'asc' },
      priceDesc:  { price: 'desc'},
      mileageAsc: { mileage: 'asc' },
      mileageDesc:{ mileage: 'desc' },
    };
    const orderBy = sortMap[sortBy] ?? { year: 'desc' };

    const size = Math.min(Math.max(Number(pageSize) || 20, 1), 50);
    const index = Math.max(Number(pageIndex) || 0, 0);
    const skip  = index * size;

    const [items, total] = await Promise.all([
      prisma.car.findMany({ where, orderBy, skip, take: size }),
      prisma.car.count({ where }),
    ]);

    res.json({ items, total, pageIndex: index, pageSize: size });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'search_failed' });
  }
});


app.get('/cars/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

    const car = await prisma.car.findUnique({ where: { carId: id } });
    if (!car) return res.status(404).json({ error: 'Not found' });
    res.json(car);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/cars', requireAdmin, async (req, res) => {
  try {
    const { make, model, year, price, color, mileage, fuel, image, bodyType } = req.body;
    if (!make || !model || year == null || price == null || mileage == null || !fuel) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const normalizedImage =
      (typeof image === 'string' && image.trim() !== '') ? image.trim() : null;

    const allowedBody = Object.values(BodyType) as string[];
    const btCanon = bodyType
      ? allowedBody.find(v => v.toLowerCase() === String(bodyType).toLowerCase()) ?? null
      : null;

    const car = await prisma.car.create({
      data: {
        make,
        model,
        year: Number(year),
        price: Number(price),
        color: color ?? null,
        mileage: Number(mileage),
        fuel,
        image: normalizedImage,
        bodyType: (btCanon as BodyType | null),
      }
    });

    res.status(201).json(car);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Bad request' });
  }
});


app.put('/cars/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { make, model, year, price, color, mileage, fuel, image, bodyType } = req.body;

    const imagePatch =
      image === undefined
        ? {}
        : {
            image:
              (typeof image === 'string' && image.trim() === '')
                ? null
                : image
          };

    const allowedBody = Object.values(BodyType) as string[];
    const btCanon = bodyType === undefined
      ? undefined
      : (allowedBody.find(v => v.toLowerCase() === String(bodyType).toLowerCase()) ?? null);

    const updated = await prisma.car.update({
      where: { carId: id },
      data: {
        ...(make    !== undefined ? { make } : {}),
        ...(model   !== undefined ? { model } : {}),
        ...(year    !== undefined ? { year: Number(year) } : {}),
        ...(price   !== undefined ? { price: Number(price) } : {}),
        ...(color   !== undefined ? { color: color ?? null } : {}),
        ...(mileage !== undefined ? { mileage: Number(mileage) } : {}),
        ...(fuel    !== undefined ? { fuel } : {}),
        ...imagePatch,
        ...(btCanon !== undefined ? { bodyType: btCanon as any } : {}),
      }
    });

    res.json(updated);
  } catch (e: any) {
    console.error(e);
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(400).json({ error: 'Bad request' });
  }
});


app.delete('/cars/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.car.delete({ where: { carId: id } });
    res.status(204).send();
  } catch (e: any) {
    console.error(e);
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    if (e?.code === 'P2003') return res.status(409).json({ error: 'Car is used in orders' });
    res.status(400).json({ error: 'Bad request' });
  }
});


app.post('/admin/cars/fill-images', requireAdmin, async (_req, res) => {
  try {
    const cars = await prisma.car.findMany({
      where: { OR: [{ image: null }, { image: '' }] },
      orderBy: { carId: 'asc' }
    });

    let updated = 0;
    for (const c of cars) {
      const url = await findCarImage(c.make, c.model, c.year);
      if (url) {
        await prisma.car.update({ where: { carId: c.carId }, data: { image: url } });
        updated++;
        await delay(350);
      }
    }
    res.json({ scanned: cars.length, updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to fill images' });
  }
});


app.patch('/cars/:id/image/refresh', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const car = await prisma.car.findUnique({ where: { carId: id } });
    if (!car) return res.status(404).json({ error: 'Not found' });

    const url = await findCarImage(car.make, car.model, car.year);
    if (!url) return res.status(404).json({ error: 'No image found' });

    const updated = await prisma.car.update({ where: { carId: id }, data: { image: url } });
    res.json(updated);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Refresh failed' });
  }
});

app.get('/debug/cars-facets', async (_req, res) => {
  try {
    const cars = await prisma.car.findMany({
      select: { bodyType: true, fuel: true, year: true, price: true, mileage: true }
    });
    const byBody: Record<string, number> = {};
    const byFuel: Record<string, number> = {};
    for (const c of cars) {
      const bt = c.bodyType ?? 'NULL';
      byBody[bt] = (byBody[bt] ?? 0) + 1;
      const f = (c.fuel ?? '').toLowerCase();
      byFuel[f] = (byFuel[f] ?? 0) + 1;
    }
    res.json({ total: cars.length, byBody, byFuel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'facets_failed' });
  }
});


app.get('/orders', requireAdmin, async (_req, res) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { orderId: 'desc' },
      include: { items: true, user: true }
    });
    res.json(orders);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/orders/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const order = await prisma.order.findUnique({
      where: { orderId: id },
      include: { items: true, user: true }
    });
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(order);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/orders/by-email', async (req, res) => {
  try {
    const email = String(req.query.user || '').trim().toLowerCase();
    if (!email) return res.json([]);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json([]);

    const orders = await prisma.order.findMany({
      where: { userId: user.userId },
      orderBy: { orderId: 'desc' },
      include: { items: { include: { car: true } } }
    });

    const out = orders.map(o => ({
      orderId: o.orderId,
      total: o.total,
      rating: o.rating,
      ratedAt: o.ratedAt,
      createdAt: o.createdAt,
      items: o.items.map(i => ({
        carId: i.carId,
        make: i.car.make,
        model: i.car.model,
        year: i.car.year,
        price: i.price,
        image: i.car.image
      }))
    }));
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'order_status_failed' });
  }
});

app.delete('/orders/:id', async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const email = String(req.query.user || '').trim().toLowerCase();
    if (!orderId || !email) return res.status(400).json({ error: 'orderId_and_user_required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'not_found' });

    const order = await prisma.order.findFirst({ where: { orderId, userId: user.userId } });
    if (!order) return res.status(404).json({ error: 'not_found' });

    if (order.rating != null) {
      return res.status(409).json({ error: 'already_completed' });
    }

    await prisma.order.delete({ where: { orderId } });
    return res.status(204).send();
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'cancel_failed' });
  }
});

app.get('/my/orders', requireAuth, async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { userId: req.userId },
    orderBy: { orderId: 'desc' },
    include: { items: true }
  });
  res.json(orders);
});

app.post('/orders', requireAuth, async (req, res) => {
  try {
    const { fullName, email, phone, address, items } = req.body as {
      fullName: string; email?: string; phone?: string; address?: string;
      items: Array<{ carId: number; quantity?: number }>;
    };
    if (!fullName || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing fullName or items' });
    }

    const ids = items.map(i => Number(i.carId));
    const cars = await prisma.car.findMany({ where: { carId: { in: ids } } });
    if (cars.length !== ids.length) return res.status(400).json({ error: 'Invalid carId in items' });

    const orderItems = cars.map(c => {
      const q = items.find(i => i.carId === c.carId)?.quantity ?? 1;
      return { carId: c.carId, price: Number(c.price), quantity: Number(q) };
    });
    const total = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);

    const order = await prisma.order.create({
      data: {
        fullName, email, phone, address: address ?? null,
        total, userId: req.userId!,
        items: { create: orderItems }
      },
      include: { items: true }
    });

    res.status(201).json(order);
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'Bad request' });
  }
});

app.patch('/my/orders/:id/rating', requireAuth, async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    const { rating, comment } = req.body || {};

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ error: 'Rating must be an integer 1–5' });
    }

    const existing = await prisma.order.findFirst({
      where: { orderId, userId: req.userId! },
      select: { orderId: true }
    });
    if (!existing) return res.status(404).json({ error: 'Order not found' });

    const updated = await prisma.order.update({
      where: { orderId },
      data: {
        rating: r,
        ratingComment: (typeof comment === 'string' && comment.trim() !== '') ? comment.trim() : null,
        ratedAt: new Date()
      },
      select: { orderId: true, rating: true, ratingComment: true, ratedAt: true }
    });

    res.json({ ok: true, ...updated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to rate order' });
  }
});

async function getOrCreateCart(identity: Identity) {
  const where = identity.userId
    ? { userId: identity.userId }
    : { sessionId: identity.sessionId ?? undefined };

  let cart = await prisma.cart.findFirst({ where });
  if (!cart) {
    cart = await prisma.cart.create({
      data: identity.userId ? { userId: identity.userId } : { sessionId: identity.sessionId! },
    });
  }
  return cart;
}

async function getCart(identity: Identity) {
  const cart = await getOrCreateCart(identity);
  return prisma.cart.findUnique({
    where: { cartId: cart.cartId },
    include: { items: { include: { car: true } } },
  });
}

app.get('/cart', async (req, res) => {
  const ident = identityOf(req, res);
  if (!ident) return;
  try {
    const data = await getCart(ident);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/cart/add', async (req, res) => {
  const ident = identityOf(req, res);
  if (!ident) return;
  try {
    const { carId, quantity } = req.body || {};
    if (!carId) return res.status(400).json({ error: 'carId required' });

    const cart = await getOrCreateCart(ident);
    const car = await prisma.car.findUnique({ where: { carId: Number(carId) } });
    if (!car) return res.status(404).json({ error: 'Car not found' });

    const existing = await prisma.cartItem.findUnique({
      where: { cartId_carId: { cartId: cart.cartId, carId: Number(carId) } },
    });

    if (existing) {
      await prisma.cartItem.update({
        where: { cartItemId: existing.cartItemId },
        data: { quantity: existing.quantity + Number(quantity ?? 1), price: car.price },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.cartId,
          carId: Number(carId),
          quantity: Number(quantity ?? 1),
          price: car.price,
        },
      });
    }

    const data = await getCart(ident);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/cart/item/:id', async (req, res) => {
  const ident = identityOf(req, res);
  if (!ident) return;
  try {
    const cart = await getOrCreateCart(ident);
    const itemId = Number(req.params.id);
    const item = await prisma.cartItem.findUnique({ where: { cartItemId: itemId } });
    if (!item || item.cartId !== cart.cartId) {
      return res.status(404).json({ error: 'Item not in your cart' });
    }
    await prisma.cartItem.delete({ where: { cartItemId: itemId } });
    const data = await getCart(ident);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/cart/clear', async (req, res) => {
  const ident = identityOf(req, res);
  if (!ident) return;
  try {
    const cart = await getOrCreateCart(ident);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.cartId } });
    const data = await getCart(ident);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/cart/reserve', async (req, res) => {
  try {
    const { user, carId } = req.body as { user?: string; carId?: number };
    const email = String(user || '').trim().toLowerCase();
    const carIdNum = Number(carId);

    if (!email || !carIdNum) {
      return res.status(400).json({ error: 'user_and_carId_required' });
    }

    const car = await prisma.car.findUnique({ where: { carId: carIdNum } });
    if (!car) return res.status(404).json({ error: 'car_not_found' });

    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      u = await prisma.user.create({
        data: { email, passwordHash: '', fullName: null, role: 'USER' }
      });
    }

    const order = await prisma.order.create({
      data: {
        fullName: u.fullName ?? email,
        email: email,
        phone: null,
        address: null,
        total: car.price,
        user: { connect: { userId: u.userId } },
        items: {
          create: [{
            car: { connect: { carId: car.carId } },
            price: car.price,
            quantity: 1
          }]
        }
      },
      select: { orderId: true }
    });

    res.status(201).json({ orderId: order.orderId });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: 'reserve_failed' });
  }
});

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));

async function gracefulExit(code = 0) {
  try { await prisma.$disconnect(); } finally { process.exit(code); }
}
process.on('SIGINT', () => gracefulExit(0));
process.on('SIGTERM', () => gracefulExit(0));
