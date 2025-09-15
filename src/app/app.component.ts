import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatBadgeModule } from '@angular/material/badge';

import { AuthService } from './services/auth.service';
import { CartService } from './services/cart.service';
import { ChatbotComponent } from './chatbot/chatbot.component';

import { Observable, Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [
    CommonModule,
    RouterLink, RouterLinkActive, RouterOutlet,
    MatToolbarModule, MatButtonModule, MatIconModule, MatBadgeModule,
    ChatbotComponent
  ]
})
export class AppComponent implements OnInit, OnDestroy {
  mobileOpen = false;

  cartCount$!: Observable<number>;
  cartCount = 0;

  private sub?: Subscription;

  constructor(
    public authService: AuthService,
    private cartService: CartService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.cartCount$ = this.cartService.cartCount$;
    this.sub = this.cartCount$.subscribe(n => {
      const v = Number(n);
      this.cartCount = Number.isFinite(v) && v > 0 ? v : 0;
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  toggleMobile() { this.mobileOpen = !this.mobileOpen; }

  logout() {
    this.authService.logout();
    this.mobileOpen = false;
    this.router.navigate(['/']);
  }
}
