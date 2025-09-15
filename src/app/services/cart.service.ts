import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, of } from 'rxjs';
import { map, tap, catchError } from 'rxjs/operators';

export interface CartItem {

  id: number;
  model: string;
  image: string;
  description: string;
  fuel: string;
  year: number;
  mileage: string;
  origin: string;
  price: number;
  status: 'waiting' | 'in progress' | 'received' | 'canceled';
  rating?: number;

  serverItemId?: number;
}

interface ServerCartItem {
  cartItemId: number;
  carId: number;
  price: number;
  quantity: number;
  car?: any;
}
interface ServerCart {
  cartId: number;
  items: ServerCartItem[];
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly api = (localStorage.getItem('CAR_API_BASE') || 'http://localhost:3000').replace(/\/+$/, '');
  private readonly sessionKey = 'carstore_session_id';
  private readonly metaKey = 'carstore_cart_meta';

  private cartSubject = new BehaviorSubject<CartItem[]>([]);
  readonly items$ = this.cartSubject.asObservable();
  readonly cartCount$ = this.items$.pipe(map(items => items.length));
  readonly total$ = this.items$.pipe(map(items => items.reduce((s, it) => s + (Number(it.price) || 0), 0)));

  constructor(private http: HttpClient) {
    this.refresh().subscribe();
  }

  addToCart(car: Omit<CartItem, 'status' | 'rating' | 'serverItemId'>) {
    this.http.post<ServerCart>(`${this.api}/cart/add`, { carId: car.id, quantity: 1 }, { headers: this.headers() })
      .pipe(
        tap(sc => this.cartSubject.next(this.mapServerToClient(sc))),
        catchError(_ => {
          const curr = this.cartSubject.value.slice();
          if (!curr.some(i => i.id === car.id)) {
            curr.push({ ...car, status: 'waiting' });
          }
          this.cartSubject.next(curr);
          return of(curr);
        })
      ).subscribe();
  }

  removeFromCart(carId: number) {
    const item = this.cartSubject.value.find(i => i.id === carId);
    if (item?.serverItemId) {
      this.http.delete<ServerCart>(`${this.api}/cart/item/${item.serverItemId}`, { headers: this.headers() })
        .pipe(
          tap(sc => this.cartSubject.next(this.mapServerToClient(sc))),
          catchError(_ => {
            this.removeLocal(carId);
            return of(this.cartSubject.value);
          })
        ).subscribe();
    } else {
      this.removeLocal(carId);
    }
  }

  updateStatus(id: number, newStatus: 'received' | 'in progress' | 'canceled') {
    const meta = this.readMeta();
    meta[id] = { ...(meta[id] || {}), status: newStatus };
    this.writeMeta(meta);
    this.refresh().subscribe();
  }

  rateItem(id: number, rating: number) {
    const meta = this.readMeta();
    meta[id] = { ...(meta[id] || {}), rating };
    this.writeMeta(meta);
    this.refresh().subscribe();
  }

  clearCart() {
    this.http.post<ServerCart>(`${this.api}/cart/clear`, {}, { headers: this.headers() })
      .pipe(
        tap(sc => this.cartSubject.next(this.mapServerToClient(sc))),
        catchError(_ => {
          this.cartSubject.next([]);
          return of([]);
        })
      ).subscribe();
  }

  getCart(): CartItem[] {
    return this.cartSubject.value;
  }

  getTotalPrice(): number {
    return this.cartSubject.value.reduce((t, i) => t + (Number(i.price) || 0), 0);
  }

  refresh() {
    return this.http.get<ServerCart>(`${this.api}/cart`, { headers: this.headers() })
      .pipe(
        tap(sc => this.cartSubject.next(this.mapServerToClient(sc))),
        catchError(_ => of(this.cartSubject.value))
      );
  }

  private headers(): HttpHeaders {
    return new HttpHeaders().set('x-session-id', this.ensureSessionId());
  }

  private ensureSessionId(): string {
    let sid = localStorage.getItem(this.sessionKey);
    if (!sid) {
      sid = this.cryptoRandom();
      localStorage.setItem(this.sessionKey, sid);
    }
    return sid;
  }

  private mapServerToClient(sc?: ServerCart | null): CartItem[] {
    const meta = this.readMeta();
    const items = (sc?.items || []).map(it => {
      const car = it.car || {};
      const m = meta[car.carId] || {};
      const km = (car.mileage ?? 0);
      const modelText = [car.make, car.model].filter(Boolean).join(' ').trim();
      return {
        id: car.carId,
        serverItemId: it.cartItemId,
        model: modelText,
        image: car.image || 'assets/images/placeholder-car.png',
        description: '',
        fuel: car.fuel ?? '',
        year: car.year ?? 0,
        mileage: typeof km === 'number' ? `${km} km` : String(km),
        origin: '',
        price: it.price ?? 0,
        status: (m.status as CartItem['status']) || 'waiting',
        rating: m.rating,
      } as CartItem;
    });
    return items;
  }

  private removeLocal(carId: number) {
    const next = this.cartSubject.value.filter(i => i.id !== carId);
    this.cartSubject.next(next);
  }

  private readMeta(): Record<number, { status?: CartItem['status']; rating?: number }> {
    try { return JSON.parse(localStorage.getItem(this.metaKey) || '{}'); }
    catch { return {}; }
  }
  private writeMeta(v: Record<number, { status?: CartItem['status']; rating?: number }>) {
    localStorage.setItem(this.metaKey, JSON.stringify(v));
  }

  private cryptoRandom(): string {
    try {
      const a = crypto.getRandomValues(new Uint8Array(16));
      return Array.from(a).map(x => x.toString(16).padStart(2, '0')).join('');
    } catch {
      return Math.random().toString(36).slice(2);
    }
  }
}
