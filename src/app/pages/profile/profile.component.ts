import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../services/auth.service';
import { OrderService, Order } from '../../services/order.service';

import { ProfileService } from '../../services/profile.service';
import type { ProfileDto, Fuel } from '../../services/profile.service';

interface User {
  id: number;
  model: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  phone?: string | null;
  address?: string | null;
  favoriteFuel?: Fuel;
}

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatIconModule, MatDividerModule, MatSnackBarModule,
    MatProgressSpinnerModule
  ]
})
export class ProfileComponent implements OnInit {
  user: User = {
    id: 0, model: '', email: '', password: '', role: 'user',
    phone: '', address: '', favoriteFuel: null
  };

  allFuelTypes: Exclude<Fuel, null>[] = ['Petrol', 'Diesel', 'Electric', 'Hybrid'];

  oldPassword = '';
  newPassword = '';
  confirmPassword = '';

  pwdSuccess = false;
  @ViewChild('pwdForm') pwdForm?: NgForm;

  orders: Order[] = [];
  ordersLoading = false;
  ordersError = '';

  constructor(
    private profileApi: ProfileService,
    private authService: AuthService,
    private ordersApi: OrderService,
    private snack: MatSnackBar
  ) {}

  ngOnInit() {
    const current = (this.authService.getCurrentUser() as any) || {};
    this.user = {
      id: current.userId ?? 0,
      model: current.fullName ?? current.model ?? '',
      email: current.email ?? '',
      password: '',
      role: (current.role?.toLowerCase() === 'admin' ? 'admin' : 'user'),
      phone: current.phone ?? '',
      address: current.address ?? '',
      favoriteFuel: (current.favoriteFuel ?? null) as Fuel
    };

    this.profileApi.getMe().subscribe({
      next: (p: ProfileDto) => {
        this.user = {
          id: p.userId,
          model: p.fullName ?? '',
          email: p.email,
          password: '',
          role: 'user',
          phone: p.phone ?? '',
          address: p.address ?? '',
          favoriteFuel: (p.favoriteFuel ?? null) as Fuel
        };

        const role = this.authService.getCurrentUser()?.role || 'USER';
        this.authService.patchCachedUser({
          userId: this.user.id,
          email: this.user.email,
          fullName: this.user.model,
          phone: this.user.phone ?? null,
          address: this.user.address ?? null,
          favoriteFuel: this.user.favoriteFuel ?? null,
          role
        } as any);
      },
      error: (err: any) => {
        const msg = err?.error?.error || err?.statusText || `HTTP ${err?.status || ''}`;
        this.snack.open(`Could not load profile: ${msg}`, 'OK', { duration: 2800 });
      }
    });

    this.loadMyOrders();
  }

  getOrderRating(o: Order): number {
    return Number(o.rating ?? 0);
  }

  onRate(orderId: number, rating: number) {
    if (rating < 1 || rating > 5) return;

    this.ordersApi.rateMyOrder(orderId, rating).subscribe({
      next: (res) => {
        this.orders = this.orders.map(o =>
          o.orderId === orderId ? { ...o, rating: res.rating, ratedAt: res.ratedAt } : o
        );
        this.snack.open('Thanks for your rating!', 'OK', { duration: 1500 });
      },
      error: (err) => {
        const msg = err?.error?.error || err?.statusText || 'Rating failed';
        this.snack.open(msg, 'OK', { duration: 2500 });
      }
    });
  }

  saveChanges() {
    if (!this.user.model?.trim() || !this.user.email?.trim()) {
      this.snack.open('Full name and email are required.', 'OK', { duration: 2500 });
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(this.user.email)) {
      this.snack.open('Please enter a valid email.', 'OK', { duration: 2500 });
      return;
    }
    if (!this.user.phone?.trim() || !this.user.address?.trim()) {
      this.snack.open('Phone and address are required.', 'OK', { duration: 2500 });
      return;
    }

    const payload: Partial<ProfileDto> = {
      fullName: this.user.model ?? null,
      phone: this.user.phone ?? null,
      address: this.user.address ?? null,
      favoriteFuel: (this.user.favoriteFuel ?? null) as Fuel
    };

    this.profileApi.updateMe(payload).subscribe({
      next: (res: ProfileDto) => {
        this.user.model = res.fullName ?? '';
        this.user.phone = res.phone ?? '';
        this.user.address = res.address ?? '';
        this.user.favoriteFuel = (res.favoriteFuel ?? null) as Fuel;

        const role = this.authService.getCurrentUser()?.role || 'USER';
        this.authService.patchCachedUser({
          userId: this.user.id,
          email: this.user.email,
          fullName: this.user.model,
          phone: this.user.phone ?? null,
          address: this.user.address ?? null,
          favoriteFuel: this.user.favoriteFuel ?? null,
          role
        } as any);

        this.snack.open('Profile saved', 'OK', { duration: 1800 });
      },
      error: (err: any) => {
        const msg = err?.error?.error || err?.statusText || `HTTP ${err?.status || ''}`;
        this.snack.open(`Failed to save profile: ${msg}`, 'OK', { duration: 3500 });
      }
    });
  }

  changePassword(form?: NgForm) {
    if (!this.oldPassword || !this.newPassword || !this.confirmPassword) {
      this.snack.open('All password fields are required.', 'OK', { duration: 2500 });
      return;
    }
    if (this.newPassword.length < 6) {
      this.snack.open('The new password must have at least 6 characters.', 'OK', { duration: 2500 });
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.snack.open("The passwords don't match.", 'OK', { duration: 2500 });
      return;
    }

    this.authService.changePassword$(this.oldPassword, this.newPassword).subscribe({
      next: () => {
        (form ?? this.pwdForm)?.resetForm();
        this.pwdSuccess = true;
        setTimeout(() => (this.pwdSuccess = false), 1500);
        this.snack.open('Password successfully changed!', 'OK', { duration: 2200 });
      },
      error: (err: any) => {
        const msg = err?.error?.error || err?.statusText || `HTTP ${err?.status || ''}`;
        this.snack.open(`Failed to change password: ${msg}`, 'OK', { duration: 3000 });
      }
    });
  }

  loadMyOrders() {
    this.ordersLoading = true;
    this.ordersError = '';
    this.ordersApi.getMyOrders().subscribe({
      next: (list: Order[]) => {
        this.orders = Array.isArray(list) ? list : [];
        this.ordersLoading = false;
      },
      error: (err: any) => {
        this.ordersLoading = false;
        const msg = err?.error?.error || err?.statusText || `HTTP ${err?.status || ''}`;
        this.ordersError = `Failed to load orders: ${msg}`;
      }
    });
  }
}
