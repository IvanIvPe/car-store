import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatDivider } from '@angular/material/divider';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { CartService } from '../../services/cart.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title || 'Confirm' }}</h2>
    <div mat-dialog-content>
      <p>{{ data.message || 'Are you sure?' }}</p>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button (click)="close(false)">Cancel</button>
      <button mat-flat-button color="primary" (click)="close(true)">Yes, I am sure</button>
    </div>
  `,
})
export class ConfirmDialogComponent {
  constructor(
    private ref: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { title?: string; message?: string }
  ) {}
  close(v: boolean) { this.ref.close(v); }
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIcon, MatDivider, MatDialogModule
  ],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.css']
})
export class CheckoutComponent implements OnInit {
  cartItems: any[] = [];
  totalPrice = 0;

  customerName = '';
  address = '';
  phone = '';

  loading = false;

  constructor(
    private cartService: CartService,
    private orderService: OrderService,
    private auth: AuthService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    if (!this.auth.getCurrentUser()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }

    this.cartItems = this.cartService.getCart() || [];
    this.totalPrice = Number(this.cartService.getTotalPrice() || 0);

    if (!this.cartItems.length) {
      alert('Your cart is empty!');
      this.router.navigate(['/cart']);
    }
  }

  onImgError(ev: Event) {
    (ev.target as HTMLImageElement).src = 'assets/images/placeholder-car.png';
  }

  confirmPlaceOrder() {
    const fmtTotal = new Intl.NumberFormat('sr-RS', {
      style: 'currency', currency: 'EUR', maximumFractionDigits: 0
    }).format(this.totalPrice);

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Place order',
        message: `Are you sure you want to place this order for ${fmtTotal}?`
      }
    });

    ref.afterClosed().subscribe(ok => {
      if (ok) this.submitOrder();
    });
  }

  private submitOrder() {
    if (!this.customerName.trim() || !this.address.trim() || !this.phone.trim()) {
      alert('Please fill in all the details.');
      return;
    }
    if (!this.cartItems.length) return;

    const items = this.cartItems
      .map((i: any) => ({
        carId: Number((i && (i.id ?? i.carId)) ?? NaN),
        quantity: Number((i && i.quantity) ?? 1)
      }))
      .filter(x => Number.isFinite(x.carId) && x.carId > 0);

    if (!items.length) {
      alert('Cart items are missing carId.');
      return;
    }

    this.loading = true;

    this.orderService.placeOrder({
      fullName: this.customerName.trim(),
      phone: this.phone.trim(),
      address: this.address.trim(),
      items
    }).subscribe({
      next: (order) => {
        this.loading = false;
        this.cartService.clearCart();
        alert(`Order #${order.orderId} placed`);
        this.router.navigate(['/orders']);
      },
      error: (err) => {
        this.loading = false;
        alert(err?.error?.error ?? 'Order failed');
      }
    });
  }

displayName(it: any): string {
  const make  = it.make  ?? it.brand ?? it.carMake ?? '';
  const model = it.model ?? it.carModel ?? '';
  const base  = `${String(make).trim()} ${String(model).trim()}`.trim();
  if (base) return base;


  return it.name ?? `Car #${it.id ?? it.carId ?? ''}`;
}


displaySub(it: any): string {
  const parts: string[] = [];
  if (it.year) parts.push(String(it.year));
  if (it.fuel) parts.push(String(it.fuel));
  const km = it.mileage ?? it.km ?? null;
  if (km != null) parts.push(`${Number(km).toLocaleString('sr-RS')} km`);
  return parts.join(' • ');
}

}
