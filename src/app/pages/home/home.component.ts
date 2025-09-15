import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';

import { CarService, Car } from '../../services/car.service';
import { CartService } from '../../services/cart.service';
import { PexelsApiService } from '../../services/pexels-api.service';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

type BodyType =
  'Sedan'|'Hatchback'|'SUV'|'Coupe'|'Cabrio'|'Wagon'|'Pickup'|'Van'|'MPV'|'Crossover';

type Category = {
  label: string;
  kind: 'bodyType' | 'fuel';
  value: string;
  img: string;
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterModule,
    MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatSelectModule, MatCardModule
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  bodyTypes: BodyType[] = [
    'Sedan','Hatchback','SUV','Coupe','Cabrio','Wagon','Pickup','Van','MPV','Crossover'
  ];
  fuels = ['Petrol','Diesel','Hybrid','Electric'];

  form: {
    q?: string;
    bodyType?: BodyType | '';
    fuel?: string | '';
    maxPrice?: number | null;
    minYear?: number | null;
    maxMileage?: number | null;
  } = { q: '', bodyType: '', fuel: '', maxPrice: null, minYear: null, maxMileage: null };

  categories: Category[] = [
    { label: 'Sedan',     kind: 'bodyType', value: 'Sedan',     img: '' },
    { label: 'SUV',       kind: 'bodyType', value: 'SUV',       img: '' },
    { label: 'Hatchback', kind: 'bodyType', value: 'Hatchback', img: '' },
    { label: 'Coupe',     kind: 'bodyType', value: 'Coupe',     img: '' },
    { label: 'Electric',  kind: 'fuel',     value: 'Electric',  img: '' },
    { label: 'Wagon',     kind: 'bodyType', value: 'Wagon',     img: '' },
  ];

  featured: Car[] = [];

  newsletterEmail: string = '';
  today = new Date();
  currentYear = this.today.getFullYear();

  constructor(
    private carService: CarService,
    private cart: CartService,
    private router: Router,
    private pexels: PexelsApiService
  ) {}

  ngOnInit(): void {
    this.carService.getCars().subscribe(cars => {
      this.featured = [...(cars ?? [])]
        .sort((a, b) =>
          (b.year ?? 0) - (a.year ?? 0) ||
          (a.mileage ?? 0) - (b.mileage ?? 0)
        )
        .slice(0, 8);
    });

    this.loadCategoryImages();
  }

  private queryFor(c: Pick<Category,'label'|'kind'>): string {
    if (c.kind === 'fuel' && c.label === 'Electric') return 'electric car exterior';
    switch (c.label) {
      case 'Sedan':     return 'sedan car exterior';
      case 'SUV':       return 'suv car exterior';
      case 'Hatchback': return 'hatchback car exterior';
      case 'Coupe':     return 'coupe car exterior';
      case 'Wagon':     return 'station wagon car exterior';
      default:          return `${c.label} car exterior`;
    }
  }

  private fallbackCategoryImage(label: string): string {
    const base = 'https://cdn.imagin.studio/getImage?customer=img&modelYear=2022&angle=23&zoomType=fullscreen&fileType=jpg';
    switch (label) {
      case 'Sedan':     return `${base}&make=toyota&modelFamily=camry`;
      case 'SUV':       return `${base}&make=ford&modelFamily=explorer`;
      case 'Hatchback': return `${base}&make=volkswagen&modelFamily=golf`;
      case 'Coupe':     return `${base}&make=bmw&modelFamily=4-series`;
      case 'Wagon':     return `${base}&make=audi&modelFamily=a4%20avant`;
      case 'Electric':  return `${base}&make=tesla&modelFamily=model-3`;
      default:          return 'assets/images/placeholder-car.png';
    }
  }

  private loadCategoryImages(): void {
    const reqs = this.categories.map(cat =>
      this.pexels.searchCars(this.queryFor(cat), 1).pipe(
        map(url => url || this.fallbackCategoryImage(cat.label)),
        catchError(() => of(this.fallbackCategoryImage(cat.label)))
      )
    );
    forkJoin(reqs).subscribe(urls => {
      urls.forEach((u, i) => (this.categories[i].img = u));
    });
  }

  goSearch() {
    const qp: any = {
      q: this.form.q || undefined,
      bodyType: this.form.bodyType || undefined,
      fuel: this.form.fuel || undefined,
      maxPrice: this.form.maxPrice ?? undefined,
      minYear: this.form.minYear ?? undefined,
      maxMileage: this.form.maxMileage ?? undefined,
      sortBy: 'yearDesc',
      pageIndex: 0
    };
    this.router.navigate(['/cars'], { queryParams: qp });
  }

  openCategory(c: Category) {
    const qp =
      c.kind === 'bodyType'
        ? { bodyType: c.value, sortBy: 'yearDesc', pageIndex: 0 }
        : { fuel: c.value,     sortBy: 'yearDesc', pageIndex: 0 };

    this.router.navigate(['/cars'], { queryParams: qp });
  }

  openDetails(id: number) {
    this.router.navigate(['/car-details', id]);
  }

  addToCart(car: Car) {

    const item = {
      id: car.carId,
      model: `${car.make} ${car.model}`,
      image: car.image ?? '',
      description:
        `${car.year ?? ''} • ${car.fuel ?? ''}` +
        (car.mileage != null ? ` • ${car.mileage} km` : ''),
      fuel: car.fuel ?? '',
      year: car.year ?? 0,
      mileage: String(car.mileage ?? 0),
      origin: '',
      price: Number(car.price ?? 0)
    };
    this.cart.addToCart(item as any);
    alert('Added to cart');
  }

  imgFallback(e: Event) {
    (e.target as HTMLImageElement).src = 'assets/images/placeholder-car.png';
  }

  subscribeNewsletter() {
    const email = (this.newsletterEmail || '').trim();
    if (!email) return;
    console.log('Newsletter subscribe:', email);
    alert('Hvala! Potvrdi prijavu u inboxu.');
    this.newsletterEmail = '';
  }
}
