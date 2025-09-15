import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';

import { CarService, Car } from '../../services/car.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ]
})
export class AdminDashboardComponent implements OnInit {
  @ViewChild('formTop') formTop!: ElementRef<HTMLElement>;

  readonly base = environment.apiBaseUrl;

  cars: Car[] = [];
  filteredCars: Car[] = [];
  isEditing = false;


  query = '';


  colors: string[] = [
    'Black','White','Gray','Silver','Blue','Red','Green','Yellow','Orange','Brown','Beige','Purple'
  ];


  bodyTypes: string[] = [
    'Sedan','Hatchback','SUV','Coupe','Convertible','Wagon','Pickup','Van','Crossover','Sports'
  ];


  car: Car = {
    carId: 0,
    make: '',
    model: '',
    year: new Date().getFullYear(),
    price: 0,
    fuel: '',
    color: '',
    mileage: 0,
    image: '',
    bodyType: null
  };


  filling = false;
  refreshingId: number | null = null;
  lastFill: { scanned: number; updated: number } | null = null;

  constructor(
    private carService: CarService,
    private http: HttpClient,
    private auth: AuthService,
    private snack: MatSnackBar
  ) {}

  ngOnInit(): void { this.loadCars(); }


  private authHeaders(): HttpHeaders {
    const token =
      (this.auth as any)?.getToken?.() ||
      localStorage.getItem('auth.token') ||
      '';
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  private toast(err: any) {
    const msg = err?.error?.error || err?.message || 'Request failed';
    this.snack.open(msg, 'OK', { duration: 2800 });
  }

  private scrollToFormTop() {
    try {
      this.formTop?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }


  loadCars(): void {
    this.carService.getCars().subscribe(cars => {
      this.cars = cars;
      this.applyFilter();
    });
  }

  reloadCars(): void {
    this.carService.reload().subscribe(list => {
      this.cars = list;
      this.applyFilter();
    });
  }

  addCar(): void {
    const { carId, ...payload } = this.car;
    this.http.post<Car>(`${this.base}/cars`, payload, { headers: this.authHeaders() })
      .subscribe({
        next: (created) => {
          this.snack.open(`Car #${created.carId} created`, 'OK', { duration: 1800 });
          this.resetForm();
          this.isEditing = false;
          this.reloadCars();
          setTimeout(() => this.scrollToFormTop(), 0);
        },
        error: (err) => this.toast(err)
      });
  }

  editCar(car: Car): void {
    this.isEditing = true;
    this.car = { ...car };
    setTimeout(() => {
      this.scrollToFormTop();
      const firstInput = this.formTop?.nativeElement.querySelector('input');
      (firstInput as HTMLInputElement | null)?.focus();
    }, 0);
  }

  updateCar(): void {
    this.http.put<Car>(`${this.base}/cars/${this.car.carId}`, this.car, { headers: this.authHeaders() })
      .subscribe({
        next: (updated) => {
          this.snack.open(`Car #${updated.carId} updated`, 'OK', { duration: 1800 });
          this.resetForm();
          this.isEditing = false;
          this.reloadCars();
          setTimeout(() => this.scrollToFormTop(), 0);
        },
        error: (err) => this.toast(err)
      });
  }

  deleteCar(carId: number): void {
    if (!confirm(`Delete car #${carId}?`)) return;
    this.http.delete<void>(`${this.base}/cars/${carId}`, { headers: this.authHeaders() })
      .subscribe({
        next: () => {
          this.snack.open(`Car #${carId} deleted`, 'OK', { duration: 1600 });
          this.reloadCars();
        },
        error: (err) => this.toast(err)
      });
  }

  resetForm(): void {
    this.car = {
      carId: 0,
      make: '',
      model: '',
      year: new Date().getFullYear(),
      price: 0,
      fuel: '',
      color: '',
      mileage: 0,
      image: '',
      bodyType: null
    };
  }

  onImgError(e: Event): void {
    const img = e.target as HTMLImageElement | null;
    if (img) img.src = 'assets/images/placeholder-car.png';
  }


  fillMissingImages(): void {
    this.filling = true;
    this.lastFill = null;
    this.http.post<{ scanned: number; updated: number }>(
      `${this.base}/admin/cars/fill-images`,
      {},
      { headers: this.authHeaders() }
    ).subscribe({
      next: (res) => {
        this.filling = false;
        this.lastFill = res;
        this.snack.open(`Filled ${res.updated}/${res.scanned} images`, 'OK', { duration: 2200 });
        this.reloadCars();
      },
      error: (err) => {
        this.filling = false;
        this.toast(err);
      }
    });
  }

  refreshImage(c: Car): void {
    this.refreshingId = c.carId;
    this.http.patch<Car>(
      `${this.base}/cars/${c.carId}/image/refresh`,
      {},
      { headers: this.authHeaders() }
    ).subscribe({
      next: (updated) => {
        this.refreshingId = null;
        this.snack.open(`Image refreshed for #${updated.carId}`, 'OK', { duration: 1800 });
        this.cars = this.cars.map(x => x.carId === updated.carId ? updated : x);
        this.applyFilter();
      },
      error: (err) => {
        this.refreshingId = null;
        this.toast(err);
      }
    });
  }


  onQueryChange(_v: string) { this.applyFilter(); }
  clearQuery() { this.query = ''; this.applyFilter(); }

  applyFilter(): void {
    const q = (this.query || '').trim().toLowerCase();
    if (!q) { this.filteredCars = [...this.cars]; return; }
    this.filteredCars = this.cars.filter(c =>
      `${c.make} ${c.model}`.toLowerCase().includes(q)
    );
  }

  trackById(_i: number, c: Car) { return c.carId; }
}
