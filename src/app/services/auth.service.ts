import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type FuelPref = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric';

export interface AuthUser {
  userId: number;
  email: string;
  fullName?: string | null;
  role: string;               // 'USER' | 'ADMIN' | ...
  phone?: string | null;
  address?: string | null;
  favoriteFuel?: FuelPref | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly base = (environment.apiBaseUrl || '').replace(/\/+$/, '');
  private readonly tokenKey = 'token';
  private readonly userKey  = 'user';

  private userSubject = new BehaviorSubject<AuthUser | null>(this.readUser());
  readonly user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {}

  private readUser(): AuthUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch { return null; }
  }

  private setSession(token: string, user: AuthUser) {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.userSubject.next(user);
  }

  private clearSession() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.userSubject.next(null);
  }

  private setToken(token: string) {
    localStorage.setItem(this.tokenKey, token);
  }

  private authHeaders(json = false): HttpHeaders {
    let h = new HttpHeaders();
    const t = this.getToken();
    if (t) h = h.set('Authorization', `Bearer ${t}`);
    if (json) h = h.set('Content-Type', 'application/json');
    return h;
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getCurrentUser(): AuthUser | null {
    return this.userSubject.value ?? this.readUser();
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean {
    const r = (this.getCurrentUser()?.role || '').toUpperCase();
    return r === 'ADMIN';
  }

  logout(): void {
    this.clearSession();
  }


  login$(email: string, password: string): Observable<boolean> {
    return this.http
      .post<{ token: string; user: AuthUser }>(`${this.base}/auth/login`, { email, password })
      .pipe(
        tap((res) => this.setSession(res.token, res.user)),
        map(() => true)
      );
  }

  register$(payload: { email: string; password: string; fullName?: string }): Observable<boolean> {
    return this.http
      .post<{ token: string; user: AuthUser }>(`${this.base}/auth/register`, payload)
      .pipe(
        tap((res) => this.setSession(res.token, res.user)),
        map(() => true)
      );
  }

  me$(): Observable<AuthUser> {
    return this.http
      .get<AuthUser>(`${this.base}/auth/me`, { headers: this.authHeaders() })
      .pipe(
        tap((user) => {
          const token = this.getToken();
          if (token) this.setSession(token, user);
        })
      );
  }

  updateProfile$(payload: {
    fullName?: string | null;
    phone?: string | null;
    address?: string | null;
    favoriteFuel?: FuelPref | null;
  }): Observable<AuthUser> {
    return this.http
      .put<AuthUser>(`${this.base}/users/me`, payload, { headers: this.authHeaders(true) })
      .pipe(
        tap((user) => {
          const token = this.getToken();
          if (token) this.setSession(token, user);
        })
      );
  }

  changePassword$(oldPassword: string, newPassword: string): Observable<boolean> {
    return this.http
      .post<{ ok: boolean; token?: string }>(
        `${this.base}/auth/change-password`,
        { oldPassword, newPassword },
        { headers: this.authHeaders(true) }
      )
      .pipe(
        tap((res) => {
          if (res?.token) this.setToken(res.token); // refresh JWT ako server vrati novi
        }),
        map((res) => !!res?.ok)
      );
  }

  patchCachedUser(updated: Partial<AuthUser>) {
    const cur = this.getCurrentUser();
    if (!cur) return;
    const merged = { ...cur, ...updated };
    localStorage.setItem(this.userKey, JSON.stringify(merged));
    this.userSubject.next(merged);
  }
}
