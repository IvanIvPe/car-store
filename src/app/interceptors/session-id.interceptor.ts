import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HTTP_INTERCEPTORS,
} from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

const CART_SESSION_KEY = 'carstore_session_id';
const AUTH_TOKEN_KEYS = ['token', 'auth_token', 'jwt', 'access_token'];

function getSharedSessionId(): string {
  let sid = localStorage.getItem(CART_SESSION_KEY) ?? '';
  if (!sid) {
    const generated =
      (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2);
    sid = String(generated);
    localStorage.setItem(CART_SESSION_KEY, sid);
  }
  return sid;
}

function getJwt(): string | null {
  for (const k of AUTH_TOKEN_KEYS) {
    const val = localStorage.getItem(k);
    if (val && typeof val === 'string' && val.trim()) return val;
  }
  return null;
}

@Injectable()
export class SessionIdInterceptor implements HttpInterceptor {
  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const sid = getSharedSessionId();
    const jwt = getJwt();

    let headers = req.headers.set('x-session-id', sid);
    if (jwt) headers = headers.set('Authorization', `Bearer ${jwt}`);

    const cloned = req.clone({ headers });
    return next.handle(cloned);
  }
}

export const SESSION_ID_INTERCEPTOR_PROVIDER = {
  provide: HTTP_INTERCEPTORS,
  useClass: SessionIdInterceptor,
  multi: true,
};
