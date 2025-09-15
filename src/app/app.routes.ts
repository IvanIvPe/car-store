import { Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { CarsComponent } from './pages/cars/cars.component';
import { CartComponent } from './pages/cart/cart.component';
import { ProfileComponent } from './pages/profile/profile.component';
import { LoginComponent } from './pages/login/login.component';
import { RegisterComponent } from './pages/register/register.component';
import { CheckoutComponent } from './pages/checkout/checkout.component';
import { AdminDashboardComponent } from './pages/admin-dashboard/admin-dashboard.component';
import { CarDetailsComponent } from './pages/car-details/car-details.component';
import { UserGuard } from './guards/user.guard';
import { AdminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'cars', component: CarsComponent },
  { path: 'cart', component: CartComponent },
  { path: 'profile', component: ProfileComponent, canActivate: [UserGuard] },
  { path: 'checkout', component: CheckoutComponent, canActivate: [UserGuard] },
  { path: 'admin', component: AdminDashboardComponent, canActivate: [AdminGuard] },
  { path: 'car-details/:id', component: CarDetailsComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: '**', redirectTo: '' } // Ako ruta ne postoji vracamo se na pocetnu
];
