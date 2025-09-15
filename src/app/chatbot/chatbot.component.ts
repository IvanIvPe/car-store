import { Component, ViewChild, ElementRef, OnInit, AfterViewChecked, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CartService } from '../services/cart.service';

type Sender = 'user' | 'bot';

interface ChatMessage {
  sender: Sender;
  text?: string;
  html?: SafeHtml;
  image?: string;
  time: number;
}

interface RasaMessage {
  text?: string | null;
  image?: string | null;
  custom?: {
    event?: 'cart_updated' | 'cart_cleared' | 'order_placed' | 'order_canceled' | string;
    orderId?: number;
    [k: string]: any;
  } | null;
}

interface UiCartItem {
  carId?: number;
  id?: number;
  make?: string;
  model?: string;
  year?: number;
  price?: number;
}

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css']
})
export class ChatbotComponent implements OnInit, AfterViewChecked, OnDestroy {
  userMessage = '';
  messages: ChatMessage[] = [];
  isOpen = false;
  userEmail: string = '';
  loggedIn = false;

  isTyping = false;
  pending = false;

  quickReplies: string[] = ['Hello', 'Show my cart', 'Checkout', 'Reset filters'];

  position: 'br' | 'bl' | 'right' | 'left' =
    ((localStorage.getItem('carbot_pos') as 'br' | 'bl' | 'right' | 'left' | null) ?? 'br');

  get isFloating() {
    return this.position === 'br' || this.position === 'bl';
  }

  private endpoint = 'http://localhost:5005/webhooks/rest/webhook';

  private senderId: string = this.ensureChatSessionId();

  private cartSessionId: string = this.ensureSharedCartSessionId();

  @ViewChild('chatBody', { static: false }) chatBody!: ElementRef<HTMLDivElement>;
  @ViewChild('chatWindow', { static: false }) chatWindow!: ElementRef<HTMLDivElement>;

  private cartChangedListener = () => this.cartService.refresh().subscribe();

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private sanitizer: DomSanitizer,
    private cartService: CartService // 🔔
  ) {}

  ngOnInit() {
    const saved = localStorage.getItem('chat_messages_v2');
    if (saved) {
      this.messages = JSON.parse(saved);
    } else {
      this.pushBot('Hello! Welcome to our Car Store. How can I help you today?');
    }

    const user = this.authService.getCurrentUser?.();
    this.userEmail = (user?.email ?? '');
    this.loggedIn = !!user?.email;

    const pos = localStorage.getItem('carbot_pos') as 'br' | 'bl' | 'right' | 'left' | null;
    if (pos) this.position = pos;

    window.addEventListener('carstore:cartChanged', this.cartChangedListener as EventListener);
  }

  ngOnDestroy(): void {
    window.removeEventListener('carstore:cartChanged', this.cartChangedListener as EventListener);
  }

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    setTimeout(() => this.scrollToBottom(), 100);
  }

  cyclePosition() {
    const order: Array<typeof this.position> = ['br', 'bl', 'right', 'left'];
    const idx = order.indexOf(this.position);
    this.position = order[(idx + 1) % order.length];
    localStorage.setItem('carbot_pos', this.position);

    if (this.isFloating && this.chatWindow?.nativeElement) {
      const el = this.chatWindow.nativeElement;
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.height = '';
    }

    if (!this.isOpen) this.isOpen = true;
    setTimeout(() => this.scrollToBottom(), 50);
  }

  resetSize() {
    localStorage.removeItem('carbot_size');
    const el = this.chatWindow?.nativeElement;
    if (el) {
      el.style.width = '';
      el.style.height = '';
    }
  }

  onKeyDown(ev: KeyboardEvent | Event) {
    const e = ev as KeyboardEvent;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  sendQuick(q: string) {
    this.userMessage = q;
    this.sendMessage();
  }


  private getJwtToken(): string | null {
    return (this.authService as any)?.getToken?.() ?? localStorage.getItem('token');
  }

  private getUiCartSnapshot(): UiCartItem[] {
    const keys = ['cart', 'cart_items', 'cartItems', 'ui_cart', 'shoppingCart'];
    for (const k of keys) {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as UiCartItem[];
        if (parsed && Array.isArray(parsed.items)) return parsed.items as UiCartItem[];
      } catch {
      }
    }
    return [];
  }

  sendMessage() {
    const msg = this.userMessage.trim();
    if (!msg || this.pending) return;

    this.pushUser(msg);
    this.userMessage = '';
    this.isTyping = true;
    this.pending = true;

    const jwt = this.getJwtToken();

    const metadata: any = {
      logged_in: this.loggedIn,
      user_email: this.userEmail || undefined,
      ui_cart: this.getUiCartSnapshot(),
      session_id: this.cartSessionId,
      sid: this.cartSessionId
    };
    if (jwt) metadata.jwt = jwt;

    this.http
      .post<RasaMessage[]>(this.endpoint, {
        sender: this.senderId,
        message: msg,
        metadata
      })
      .subscribe({
        next: (res) => {
          this.isTyping = false;
          this.pending = false;

          if (!Array.isArray(res) || res.length === 0) {
            this.pushBot('Hmm, I didn’t get a response. Please try again.');
            return;
          }

          for (const r of res) {
            const ev = r.custom?.event;
            if (ev) {
              this.cartService.refresh().subscribe();
              window.dispatchEvent(new CustomEvent('carstore:cartChanged', { detail: { source: 'chatbot', ev, payload: r.custom } }));
            }

            const text = (r.text ?? undefined);
            if (text && text.includes('<')) {
              this.pushBotHtml(this.sanitizer.bypassSecurityTrustHtml(text));
            } else if (text) {
              this.pushBot(text);
            }

            const img = r.image ?? undefined;
            if (typeof img === 'string' && img.length) {
              this.pushBot('', img);
            }
          }
        },
        error: () => {
          this.isTyping = false;
          this.pending = false;
          this.pushBot('❌ Error communicating with the server.');
        }
      });
  }

  clearChat() {
    this.messages = [];
    this.pushBot('Hello! Welcome to our Car Store. How can I help you today?');
  }


  private pushUser(text: string) {
    this.messages.push({ sender: 'user', text, time: Date.now() });
    this.persist();
  }

  private pushBot(text: string, image?: string) {
    const msg: ChatMessage = { sender: 'bot', time: Date.now() };
    if (text) msg.text = text;
    if (image) msg.image = image;
    this.messages.push(msg);
    this.persist();
  }

  private pushBotHtml(html: SafeHtml) {
    this.messages.push({ sender: 'bot', html, time: Date.now() });
    this.persist();
  }

  private persist() {
    localStorage.setItem('chat_messages_v2', JSON.stringify(this.messages));
    setTimeout(() => this.scrollToBottom(), 0);
  }

  private scrollToBottom() {
    if (this.chatBody?.nativeElement) {
      const el = this.chatBody.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }


  private ensureChatSessionId(): string {
    const key = 'carbot_session';
    let id: string = localStorage.getItem(key) ?? '';
    if (!id) {
      const generated = (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2);
      id = String(generated);
      localStorage.setItem(key, id);
    }
    return id;
  }

  private ensureSharedCartSessionId(): string {
    const key = 'carstore_session_id';
    let sid: string = localStorage.getItem(key) ?? '';
    if (!sid) {
      const generated = (crypto as any).randomUUID?.() || Math.random().toString(36).slice(2);
      sid = String(generated);
      localStorage.setItem(key, sid);
    }
    return sid;
  }

  dragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;

  startDrag(ev: MouseEvent | TouchEvent) {
    if (!this.isFloating) return;
    if (!this.chatWindow?.nativeElement) return;

    const el = this.chatWindow.nativeElement;
    const rect = el.getBoundingClientRect();

    const point = (ev as TouchEvent).touches?.[0] ?? (ev as MouseEvent);
    const startX = point.clientX;
    const startY = point.clientY;

    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    this.dragOffsetX = startX - rect.left;
    this.dragOffsetY = startY - rect.top;

    this.dragging = true;
    document.addEventListener('mousemove', this.onDrag, { passive: false });
    document.addEventListener('mouseup', this.stopDrag);
    document.addEventListener('touchmove', this.onDrag as any, { passive: false });
    document.addEventListener('touchend', this.stopDrag as any);
  }

  private onDrag = (ev: MouseEvent | TouchEvent) => {
    if (!this.dragging || !this.chatWindow?.nativeElement) return;

    const point = (ev as TouchEvent).touches?.[0] ?? (ev as MouseEvent);
    const clientX = point.clientX;
    const clientY = point.clientY;

    const el = this.chatWindow.nativeElement;
    const newLeft = clientX - this.dragOffsetX;
    const newTop = clientY - this.dragOffsetY;

    const maxLeft = window.innerWidth - el.offsetWidth - 8;
    const maxTop = window.innerHeight - el.offsetHeight - 8;

    el.style.left = Math.max(8, Math.min(newLeft, maxLeft)) + 'px';
    el.style.top = Math.max(8, Math.min(newTop, maxTop)) + 'px';

    ev.preventDefault?.();
  };

  private stopDrag = () => {
    if (!this.dragging) return;
    this.dragging = false;
    document.removeEventListener('mousemove', this.onDrag);
    document.removeEventListener('mouseup', this.stopDrag);
    document.removeEventListener('touchmove', this.onDrag as any);
    document.removeEventListener('touchend', this.stopDrag as any);
  };

  resizing = false;
  private resizeDir: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw' = 'se';
  private startX = 0;
  private startY = 0;
  private startLeft = 0;
  private startTop = 0;
  private startWidth = 0;
  private startHeight = 0;
  readonly MIN_W = 320;
  readonly MIN_H = 380;

  startResize(ev: MouseEvent | TouchEvent, dir: 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw') {
    if (!this.isFloating) return;
    if (!this.chatWindow?.nativeElement) return;

    const el = this.chatWindow.nativeElement;
    const rect = el.getBoundingClientRect();
    const point = (ev as TouchEvent).touches?.[0] ?? (ev as MouseEvent);

    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';

    this.resizeDir = dir;
    this.resizing = true;

    this.startX = point.clientX;
    this.startY = point.clientY;
    this.startLeft = rect.left;
    this.startTop = rect.top;
    this.startWidth = rect.width;
    this.startHeight = rect.height;

    document.addEventListener('mousemove', this.onResize, { passive: false });
    document.addEventListener('mouseup', this.stopResize);
    document.addEventListener('touchmove', this.onResize as any, { passive: false });
    document.addEventListener('touchend', this.stopResize as any);

    ev.preventDefault?.();
  }

  private onResize = (ev: MouseEvent | TouchEvent) => {
    if (!this.resizing || !this.chatWindow?.nativeElement) return;

    const point = (ev as TouchEvent).touches?.[0] ?? (ev as MouseEvent);
    const dx = point.clientX - this.startX;
    const dy = point.clientY - this.startY;

    let newLeft = this.startLeft;
    let newTop = this.startTop;
    let newWidth = this.startWidth;
    let newHeight = this.startHeight;

    switch (this.resizeDir) {
      case 'e':
        newWidth = this.startWidth + dx;
        break;
      case 's':
        newHeight = this.startHeight + dy;
        break;
      case 'w':
        newLeft = this.startLeft + dx;
        newWidth = this.startWidth - dx;
        break;
      case 'n':
        newTop = this.startTop + dy;
        newHeight = this.startHeight - dy;
        break;
      case 'se':
        newWidth = this.startWidth + dx;
        newHeight = this.startHeight + dy;
        break;
      case 'ne':
        newWidth = this.startWidth + dx;
        newTop = this.startTop + dy;
        newHeight = this.startHeight - dy;
        break;
      case 'sw':
        newLeft = this.startLeft + dx;
        newWidth = this.startWidth - dx;
        newHeight = this.startHeight + dy;
        break;
      case 'nw':
        newLeft = this.startLeft + dx;
        newTop = this.startTop + dy;
        newWidth = this.startWidth - dx;
        newHeight = this.startHeight - dy;
        break;
    }

    newWidth = Math.max(this.MIN_W, Math.min(newWidth, window.innerWidth - 16));
    newHeight = Math.max(this.MIN_H, Math.min(newHeight, window.innerHeight - 16));
    newLeft = Math.max(8, Math.min(newLeft, window.innerWidth - newWidth - 8));
    newTop = Math.max(8, Math.min(newTop, window.innerHeight - newHeight - 8));

    const el = this.chatWindow.nativeElement;
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.width = `${newWidth}px`;
    el.style.height = `${newHeight}px`;

    ev.preventDefault?.();
  };

  private stopResize = () => {
    if (!this.resizing) return;
    this.resizing = false;
    document.removeEventListener('mousemove', this.onResize);
    document.removeEventListener('mouseup', this.stopResize);
    document.removeEventListener('touchmove', this.onResize as any);
    document.removeEventListener('touchend', this.stopResize as any);

    const el = this.chatWindow?.nativeElement;
    if (el) {
      localStorage.setItem('carbot_size', JSON.stringify({ w: el.offsetWidth, h: el.offsetHeight }));
    }
  };
}
