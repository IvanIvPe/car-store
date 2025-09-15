import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, map, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Car {
  carId: number;
  make: string;
  model: string;
  year: number;
  price: number;
  fuel?: string;
  mileage?: number;
  image?: string;
  color?:string;
  bodyType?: 'Sedan' | 'Hatchback' | 'SUV' | 'Coupe' | 'Cabrio' | 'Wagon' | 'Pickup' | 'Van' | 'MPV' | 'Crossover' | null;
}

@Injectable({ providedIn: 'root' })
export class CarService {
  private readonly base = environment.apiBaseUrl;
  private readonly cars$ = new BehaviorSubject<Car[] | null>(null);

  constructor(private http: HttpClient) {}

  getCars(): Observable<Car[]> {
    if (this.cars$.value) return of(this.cars$.value);
    return this.http.get<Car[]>(`${this.base}/cars`).pipe(
      tap(list => this.cars$.next(list ?? []))
    );
  }

  getById(id: number): Observable<Car | undefined> {
    if (this.cars$.value) return of(this.cars$.value.find(c => c.carId === id));
    return this.getCars().pipe(map(list => list.find(c => c.carId === id)));
  }

  addCar(payload: Partial<Car>): Observable<Car> {
    return this.http.post<Car>(`${this.base}/cars`, payload).pipe(
      tap(created => this.cars$.next([...(this.cars$.value ?? []), created]))
    );
  }

  updateCar(car: Car): Observable<Car> {
    return this.http.put<Car>(`${this.base}/cars/${car.carId}`, car).pipe(
      tap(updated => {
        const list = this.cars$.value ?? [];
        const i = list.findIndex(x => x.carId === updated.carId);
        if (i >= 0) { const copy = [...list]; copy[i] = updated; this.cars$.next(copy); }
      })
    );
  }

  deleteCar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cars/${id}`).pipe(
      tap(() => this.cars$.next((this.cars$.value ?? []).filter(c => c.carId !== id)))
    );
  }

  reload(): Observable<Car[]> {
    return this.http.get<Car[]>(`${this.base}/cars`).pipe(
      tap(list => this.cars$.next(list ?? []))
    );
  }
}
