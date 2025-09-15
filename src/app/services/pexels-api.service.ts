import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PexelsApiService {
  private API_URL = 'https://api.pexels.com/v1/search';
  private API_KEY = 'U915iRMn70qH2rtaZh0y7TqoOMugfREuPiYUXARubV1EnfqKu8Hg2G12';

  constructor(private http: HttpClient) {}

  /**
   * 
   * @param query
   * @param perPage
   */
  searchCars(query: string, perPage: number = 1): Observable<string> {
    const headers = new HttpHeaders({ Authorization: this.API_KEY });
    const url = `${this.API_URL}?query=${encodeURIComponent(query)}&per_page=${perPage}`;
    return this.http.get<any>(url, { headers }).pipe(
      map(res => res?.photos?.[0]?.src?.large || res?.photos?.[0]?.src?.medium || '')
    );
  }
}
