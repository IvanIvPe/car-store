import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute, ParamMap } from '@angular/router';

import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CarService, Car } from '../../services/car.service';
import { CartService } from '../../services/cart.service';

type SortKey = 'priceAsc'|'priceDesc'|'yearDesc'|'yearAsc'|'mileageAsc'|'mileageDesc';

@Component({
  selector: 'app-cars',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatIconModule,
    MatChipsModule
  ],
  templateUrl: './cars.component.html',
  styleUrls: ['./cars.component.css']
})
export class CarsComponent implements OnInit {
  cars: Car[] = [];
  filteredCars: Car[] = [];

  loading = true;
  search = '';

  fuels: string[] = [];
  selectedFuel = '';

  bodyTypes: string[] = [
    'Sedan','Hatchback','SUV','Coupe','Cabrio','Wagon','Pickup','Van','MPV','Crossover'
  ];
  selectedBodyType = '';

  maxPrice: number | null = null;
  minYear: number | null = null;
  maxYear: number | null = null;
  maxMileage: number | null = null;
  sortBy: SortKey = 'yearDesc';

  pageIndex = 0;
  pageSize = 8;
  pageSlice: Car[] = [];

  private destroyRef = inject(DestroyRef);

  constructor(
    private carService: CarService,
    private cartService: CartService,
    private router: Router,
    private route: ActivatedRoute,
    private snack: MatSnackBar
  ) {}

  ngOnInit() {
    this.carService.getCars().subscribe({
      next: (cars: Car[]) => {
        this.cars = cars ?? [];

        this.fuels = this.getUnique(this.cars.map(c => c.fuel)).length
          ? this.getUnique(this.cars.map(c => c.fuel))
          : ['Petrol','Diesel','Hybrid','Electric'];

        const btFromData = this.getUnique(this.cars.map(c => c.bodyType as string));
        if (btFromData.length) this.bodyTypes = btFromData;

        this.loading = false;

        this.route.queryParamMap
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(q => {
            this.readFromQuery(q);
            this.applyAll();
          });
      },
      error: () => {
        this.loading = false;
        this.snack.open('Ne mogu da učitam automobile (API).', 'OK', { duration: 2500 });
      }
    });
  }

  applyAll() {
    this.filterCars();
    this.sortCars();
    this.ensurePageInRange();
    this.paginate();
    this.pushToQuery();
  }

  filterChanged() {
    this.pageIndex = 0;
    this.applyAll();
  }

  filterCars() {
    const q = (this.search || '').toLowerCase();
    this.filteredCars = this.cars.filter(c => {
      const matchesSearch = !q ||
        (c.make || '').toLowerCase().includes(q) ||
        (c.model || '').toLowerCase().includes(q);

      const price   = Number(c.price ?? 0);
      const year    = Number(c.year ?? 0);
      const mileage = Number(c.mileage ?? 0);

      const matchesFuel      = !this.selectedFuel || c.fuel === this.selectedFuel;
      const matchesBodyType  = !this.selectedBodyType || c.bodyType === this.selectedBodyType;
      const matchesMaxPrice  = this.maxPrice   == null || price   <= this.maxPrice!;
      const matchesMinYear   = this.minYear    == null || year    >= this.minYear!;
      const matchesMaxYear   = this.maxYear    == null || year    <= this.maxYear!;
      const matchesMaxMile   = this.maxMileage == null || mileage <= this.maxMileage!;

      return matchesSearch && matchesFuel && matchesBodyType &&
             matchesMaxPrice && matchesMinYear && matchesMaxYear && matchesMaxMile;
    });
  }

  sortCars() {
    const val = (c: Car, k: SortKey) => ({
      priceAsc:      c.price ?? 0,
      priceDesc:    -(c.price ?? 0),
      yearAsc:       c.year ?? 0,
      yearDesc:     -(c.year ?? 0),
      mileageAsc:    c.mileage ?? Number.MAX_SAFE_INTEGER,
      mileageDesc:  -(c.mileage ?? -Number.MAX_SAFE_INTEGER)
    }[k]);

    this.filteredCars = [...this.filteredCars].sort((a,b) => {
      const da = val(a, this.sortBy);
      const db = val(b, this.sortBy);
      if (da < db) return -1;
      if (da > db) return 1;
      const aN = `${a.make} ${a.model}`.trim();
      const bN = `${b.make} ${b.model}`.trim();
      return aN.localeCompare(bN);
    });
  }

  ensurePageInRange() {
    const totalPages = Math.max(1, Math.ceil(this.filteredCars.length / this.pageSize));
    if (this.pageIndex > totalPages - 1) this.pageIndex = totalPages - 1;
    if (this.pageIndex < 0) this.pageIndex = 0;
  }

  paginate(e?: PageEvent) {
    if (e) {
      this.pageIndex = e.pageIndex;
      this.pageSize  = e.pageSize;
    }
    const start = this.pageIndex * this.pageSize;
    this.pageSlice = this.filteredCars.slice(start, start + this.pageSize);
  }


  private buildQueryParams(): Record<string, any> {
    const qp: any = {
      q: this.search || null,
      fuel: this.selectedFuel || null,
      bodyType: this.selectedBodyType || null,
      maxPrice: this.maxPrice ?? null,
      minYear: this.minYear ?? null,
      maxYear: this.maxYear ?? null,
      maxMileage: this.maxMileage ?? null,
      sortBy: this.sortBy || null,
      pageIndex: this.pageIndex || null,
      pageSize: this.pageSize || null
    };
    Object.keys(qp).forEach(k => (qp[k] === null || qp[k] === undefined) && delete qp[k]);
    return qp;
  }

  private readFromQuery(q: ParamMap) {
    const num = (v: string | null) => {
      if (v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const str = (v: string | null) => (v ?? '');

    this.search           = str(q.get('q'));
    this.selectedFuel     = str(q.get('fuel'));
    this.selectedBodyType = str(q.get('bodyType'));
    this.maxPrice         = num(q.get('maxPrice'));
    this.minYear          = num(q.get('minYear'));
    this.maxYear          = num(q.get('maxYear'));
    this.maxMileage       = num(q.get('maxMileage'));
    this.sortBy           = (q.get('sortBy') as SortKey) || 'yearDesc';

    const pIdx  = num(q.get('pageIndex'));
    const pSize = num(q.get('pageSize'));
    if (pIdx  !== null) this.pageIndex = Math.max(0, pIdx);
    if (pSize !== null) this.pageSize  = Math.max(4, pSize);
  }

  private pushToQuery() {
    const qp = this.buildQueryParams();
    const current = this.route.snapshot.queryParams;
    const same = JSON.stringify(qp) === JSON.stringify(current);
    if (same) return;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: qp,
      replaceUrl: true
    });
  }

  private getUnique(list: (string | undefined | null)[]): string[] {
    return [...new Set(list.filter(Boolean) as string[])];
  }

  quickFuel(fuel?: string) {
    this.selectedFuel = fuel ?? '';
    this.pageIndex = 0;
    this.applyAll();
  }

  clearFilters() {
    this.search = '';
    this.selectedFuel = '';
    this.selectedBodyType = '';
    this.maxPrice = this.minYear = this.maxYear = this.maxMileage = null;
    this.sortBy = 'yearDesc';
    this.pageIndex = 0;
    this.applyAll();
  }

  goToDetails(carId: number) {
    this.router.navigate(['/car-details', carId]);
  }

  addToCart(car: Car) {
    const item = {
      id: car.carId,
      model: `${car.make} ${car.model}`,
      image: car.image ?? '',
      description: `${car.year ?? ''} • ${car.fuel ?? ''}` + (car.mileage != null ? ` • ${car.mileage} km` : ''),
      fuel: car.fuel ?? '',
      year: car.year ?? 0,
      mileage: String(car.mileage ?? 0),
      origin: '',
      price: Number(car.price ?? 0)
    };
    this.cartService.addToCart(item as any);
    this.snack.open(`${car.make} ${car.model} added to cart`, 'OK', { duration: 2000 });
  }

  imgFallback(e: Event) {
    (e.target as HTMLImageElement).src = 'assets/images/placeholder-car.png';
  }

  trackByCar = (_: number, car: Car) => car.carId;
}
