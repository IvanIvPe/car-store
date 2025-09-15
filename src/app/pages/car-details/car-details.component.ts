import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { CarService, Car } from '../../services/car.service';
import { CartService } from '../../services/cart.service';

@Component({
  selector: 'app-car-details',
  standalone: true,
  imports: [
    CommonModule, RouterModule,
    MatButtonModule, MatIconModule, MatDividerModule,
    MatChipsModule, MatProgressSpinnerModule
  ],
  templateUrl: './car-details.component.html',
  styleUrls: ['./car-details.component.css']
})
export class CarDetailsComponent implements OnInit {
  car?: Car;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private carService: CarService,
    private cartService: CartService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    this.carService.getById(id).subscribe({
      next: c => { this.car = c; this.loading = false; },
      error: _ => { this.loading = false; }
    });
  }

  addToCart(): void {
    if (!this.car) return;
    const item = {
      id: this.car.carId,
      name: `${this.car.make} ${this.car.model}`,
      price: Number(this.car.price ?? 0),
      image: this.car.image ?? '',
      description: `${this.car.year ?? ''} • ${this.car.fuel ?? ''}` +
                   (this.car.mileage != null ? ` • ${this.car.mileage} km` : ''),
      origin: ''
    };
    this.cartService.addToCart(item as any);
    alert('Added to cart');
  }

  onImgError(e: Event) {
    const img = e.target as HTMLImageElement | null;
    if (img) img.src = 'assets/images/placeholder-car.png';
  }
}
