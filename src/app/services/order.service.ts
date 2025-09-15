import { Injectable, Optional } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface OrderItemInput { carId: number; quantity?: number; }
export interface OrderInput {
  fullName: string;
  email?: string;
  phone?: string;
  address?: string;
  items: OrderItemInput[];
}

export interface OrderItem {
  orderItemId: number;
  orderId: number;
  carId: number;
  price: number;
  quantity: number;
}

export interface Order {
  orderId: number;
  createdAt: string;
  fullName: string;
  email?: string;
  phone?: string;
  address?: string | null;
  total: number;
  items: OrderItem[];

  rating?: number | null;
  ratedAt?: string | null;
  ratingComment?: string | null;
}

@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly base = environment.apiBaseUrl;

  constructor(private http: HttpClient, @Optional() private auth?: AuthService) {}

  private authHeaders(): HttpHeaders | undefined {
    const t =
      (this.auth as any)?.getToken?.() ??
      (this.auth as any)?.token ??
      (this.auth as any)?.getAccessToken?.() ??
      localStorage.getItem('token') ??
      localStorage.getItem('authToken') ??
      localStorage.getItem('jwt');

    return t ? new HttpHeaders({ Authorization: `Bearer ${t}` }) : undefined;
  }

  placeOrder(payload: OrderInput): Observable<Order> {
    return this.http.post<Order>(`${this.base}/orders`, payload, {
      headers: this.authHeaders()
    });
  }

  getOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.base}/orders`, {
      headers: this.authHeaders()
    });
  }

  getMyOrders(): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.base}/my/orders`, {
      headers: this.authHeaders()
    });
  }

  getOrder(id: number): Observable<Order> {
    return this.http.get<Order>(`${this.base}/orders/${id}`, {
      headers: this.authHeaders()
    });
  }

  rateMyOrder(orderId: number, rating: number, comment?: string) {
    return this.http.patch<{ ok: true; rating: number; ratedAt: string }>(
      `${this.base}/my/orders/${orderId}/rating`,
      { rating, comment },
      { headers: this.authHeaders() }
    );
  }
}
