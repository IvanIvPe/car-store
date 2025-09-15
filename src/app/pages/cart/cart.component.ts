import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatSortModule } from '@angular/material/sort';
import { RouterModule } from '@angular/router';
import { MatDividerModule } from '@angular/material/divider';
import { CartService, CartItem } from '../../services/cart.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatSortModule,
    RouterModule,
    MatDividerModule
  ],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.css']
})
export class CartComponent implements OnInit {
  cartItems: CartItem[] = [];

  displayedColumns: string[] = ['image', 'model', 'price', 'actions'];

  promo = '';
  promoDiscount = 0;
  promoName = '';

  constructor(private cartService: CartService, private snack: MatSnackBar) {}

  ngOnInit() { this.refreshCart(); }

  removeItem(id: number) {
    this.cartService.removeFromCart(id);
    this.refreshCart();
  }

  clearCart() {
    this.cartService.clearCart();
    this.refreshCart();
  }

  applyPromo() {
    const code = (this.promo || '').trim().toUpperCase();
    if (code === 'SAVE10') {
      this.promoDiscount = 0.10;
      this.promoName = 'SAVE10';
      this.snack.open('Promo applied: 10% off', 'OK', { duration: 1500 });
    } else {
      this.promoDiscount = 0;
      this.promoName = '';
      this.snack.open('Invalid promo code', 'OK', { duration: 1500 });
    }
  }

  get subtotal(): number {
    return this.cartItems.reduce((s, it) => s + Number(it.price || 0), 0);
  }
  get discounted(): number {
    return this.subtotal * (1 - this.promoDiscount);
  }
  get vat(): number {
    return this.discounted * 0.20; // 20% VAT
  }
  get total(): number {
    return this.discounted + this.vat;
  }

  private refreshCart() {
    this.cartItems = this.cartService.getCart();
  }

  onCarImageError(event: Event) {
    (event.target as HTMLImageElement).src = 'assets/images/placeholder-car.png';
  }


displayName(it: any): string {
  const make  = it?.make ?? it?.brand ?? it?.carMake ?? '';
  const model = it?.model ?? it?.carModel ?? it?.name ?? 'Car';
  const name = `${make} ${model}`.trim();
  return name || 'Car';
}


}
