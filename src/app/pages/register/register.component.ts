import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
  imports: [
    CommonModule, FormsModule, RouterLink,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatDividerModule, MatSnackBarModule
  ]
})
export class RegisterComponent {
  model = '';
  email = '';
  password = '';
  confirmPassword = '';
  errorMessage = '';

  hide = true;
  hide2 = true;
  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private snack: MatSnackBar
  ) {}

  private isValidEmail(v: string): boolean {
    return /^\S+@\S+\.\S+$/.test(v);
  }

  register() {
    this.errorMessage = '';

    // validacija forme
    if (!this.model.trim() || !this.email.trim() || !this.password.trim() || !this.confirmPassword.trim()) {
      return this.fail('All fields are required!');
    }
    if (!this.isValidEmail(this.email)) {
      return this.fail('Enter a valid email address.');
    }
    if (this.password.length < 6) {
      return this.fail('Password must be at least 6 characters.');
    }
    if (this.password !== this.confirmPassword) {
      return this.fail('Passwords do not match!');
    }

    this.loading = true;
    this.authService.register$({
      email: this.email.trim(),
      password: this.password,
      fullName: this.model.trim()
    }).subscribe({
      next: () => {
        this.loading = false;
        this.snack.open('Account created!', 'OK', { duration: 2000 });
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading = false;
        this.fail(err?.error?.error ?? 'Registration failed');
      }
    });
  }

  private fail(msg: string) {
    this.errorMessage = msg;
    this.snack.open(msg, 'OK', { duration: 2600 });
  }
}
