import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
@Injectable({ providedIn: 'root' })
export class UserGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    return this.auth.isLoggedIn()
      ? true
      : this.router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
  }
}
