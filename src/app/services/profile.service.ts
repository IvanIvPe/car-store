import { Injectable, Optional } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export type Fuel = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric' | null;

export interface ProfileDto {
  userId: number;
  email: string;
  fullName?: string | null;
  phone?: string | null;
  address?: string | null;
  favoriteFuel?: Fuel;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {

  private readonly base = (environment.apiBaseUrl || window.location.origin).replace(/\/+$/, '');

  private readonly meUrl = `${this.base}/users/me`;

  constructor(
    private http: HttpClient,
    @Optional() private auth?: AuthService
  ) {}

  private authHeaders(json = false): HttpHeaders {
    const token =
      (this.auth as any)?.getToken?.() ??
      localStorage.getItem('auth.token') ??
      localStorage.getItem('token') ??
      localStorage.getItem('jwt') ??
      '';

    let headers = new HttpHeaders();
    if (token) headers = headers.set('Authorization', `Bearer ${token}`);
    if (json)  headers = headers.set('Content-Type', 'application/json');
    return headers;
  }

  getMe(): Observable<ProfileDto> {
    return this.http.get<ProfileDto>(this.meUrl, {
      headers: this.authHeaders()
    });
  }

  updateMe(body: Partial<ProfileDto>): Observable<ProfileDto> {
    return this.http.put<ProfileDto>(this.meUrl, body ?? {}, {
      headers: this.authHeaders(true)
    });
  }
}
