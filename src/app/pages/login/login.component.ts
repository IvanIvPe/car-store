import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { AuthService } from '../../services/auth.service';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatCheckboxModule,
    MatSnackBarModule
  ]
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  remember = false;
  hide = true;
  errorMessage = '';
  loading = false;

  private redirectUrl: string | null = null;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private snack: MatSnackBar
  ) {}

  ngOnInit(): void {

    this.redirectUrl = this.route.snapshot.queryParamMap.get('redirect');


    try {
      const remembered = localStorage.getItem('remember.email');
      if (remembered) {
        this.email = remembered;
        this.remember = true;
      }
    } catch {}
  }

  private isValidEmail(v: string): boolean {
    return /^\S+@\S+\.\S+$/.test(v);
  }

  private persistRememberedEmail(): void {
    try {
      if (this.remember) {
        localStorage.setItem('remember.email', this.email);
      } else {
        localStorage.removeItem('remember.email');
      }
    } catch {}
  }

  login(): void {
    this.errorMessage = '';

    const email = this.email.trim();
    const password = this.password;

    if (!email || !password) {
      return this.showError('Please enter email and password.');
    }
    if (!this.isValidEmail(email)) {
      return this.showError('Enter a valid email address.');
    }
    if (password.length < 6) {
      return this.showError('Password must be at least 6 characters.');
    }

    this.loading = true;

    this.authService.login$(email, password)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.persistRememberedEmail();
          this.snack.open('Welcome back!', 'OK', { duration: 2000 });

          const target = this.redirectUrl || '/';
          this.router.navigateByUrl(target);
        },
        error: (err: any) => {
          const apiMsg =
            err?.error?.message ||
            err?.error?.error ||
            err?.message ||
            'Invalid email or password.';
          this.showError(apiMsg);
        }
      });
  }

  private showError(msg: string): void {
    this.errorMessage = msg;
    this.snack.open(msg, 'OK', { duration: 2500 });
  }
}
