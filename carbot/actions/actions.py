from __future__ import annotations

import os, re, json, requests
from typing import Any, Text, Dict, List, Optional

from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet, SessionStarted, ActionExecuted, FollowupAction
from rasa_sdk.forms import FormValidationAction

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

API_BASE = (os.getenv("CAR_API_BASE", "http://localhost:3000") or "").rstrip("/")
try:
    _req_ms = float(os.getenv("REQUEST_TIMEOUT_MS", "10000"))
except Exception:
    _req_ms = 10000.0
TIMEOUT_S: float = max(_req_ms / 1000.0, 1.0)
VERIFY_SSL = os.getenv("VERIFY_SSL", "true").lower() == "true"

_CURRENCY_RE = re.compile(r"[^\d.,]")

def _to_float(v: Any) -> Optional[float]:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except Exception:
        try:
            s = str(v)
            s = _CURRENCY_RE.sub("", s).replace(",", ".")
            return float(s)
        except Exception:
            return None

def _to_int(v: Any) -> Optional[int]:
    f = _to_float(v)
    try:
        return int(f) if f is not None else None
    except Exception:
        return None

def _norm(s: Any) -> Optional[str]:
    if s is None:
        return None
    s = str(s).strip()
    return s or None

def _lcnorm(s: Any) -> str:
    v = _norm(s)
    return v.lower() if v is not None else ""

def _fmt_eur(n: Any) -> str:
    try:
        i = int(float(n))
        return "€" + f"{i:,}".replace(",", " ")
    except Exception:
        return "€—"

def _headers_from_tracker(tracker: Tracker) -> Dict[str, str]:
    md = tracker.latest_message.get("metadata", {}) or {}
    sid = _norm(tracker.get_slot("session_id")) or _norm(md.get("session_id")) or _norm(md.get("sid"))
    jwt = _norm(md.get("jwt"))
    headers: Dict[str, str] = {"Content-Type": "application/json"}
    if sid:
        headers["x-session-id"] = sid
    if jwt:
        headers["Authorization"] = f"Bearer {jwt}"
    return headers

def _api_get(path: str, params: Dict[str, Any] | None = None, headers: Dict[str, str] | None = None) -> Optional[Any]:
    if not API_BASE:
        return None
    try:
        r = requests.get(f"{API_BASE}{path}", params=params or {}, headers=headers or {}, timeout=TIMEOUT_S, verify=VERIFY_SSL)
        r.raise_for_status()
        return r.json() if r.content else {}
    except Exception:
        return None

def _api_post(path: str, payload: Dict[str, Any] | None = None, headers: Dict[str, str] | None = None) -> Optional[Any]:
    if not API_BASE:
        return None
    try:
        r = requests.post(f"{API_BASE}{path}", json=payload or {}, headers=headers or {}, timeout=TIMEOUT_S, verify=VERIFY_SSL)
        r.raise_for_status()
        return r.json() if r.content else {}
    except Exception:
        return None

def _api_delete(path: str, params: Dict[str, Any] | None = None, headers: Dict[str, str] | None = None) -> bool:
    if not API_BASE:
        return False
    try:
        r = requests.delete(f"{API_BASE}{path}", params=params or {}, headers=headers or {}, timeout=TIMEOUT_S, verify=VERIFY_SSL)
        r.raise_for_status()
        return True
    except Exception:
        return False

def _api_get_auth(path: str, jwt_token: str) -> Optional[Any]:
    if not API_BASE or not jwt_token:
        return None
    try:
        r = requests.get(
            f"{API_BASE}{path}",
            headers={"Authorization": f"Bearer {jwt_token}"},
            timeout=TIMEOUT_S,
            verify=VERIFY_SSL,
        )
        r.raise_for_status()
        return r.json() if r.content else {}
    except Exception:
        return None

def _api_post_auth(path: str, payload: Dict[str, Any], jwt_token: str) -> Optional[Any]:
    if not API_BASE or not jwt_token:
        return None
    try:
        r = requests.post(
            f"{API_BASE}{path}",
            json=payload,
            headers={"Authorization": f"Bearer {jwt_token}", "Content-Type": "application/json"},
            timeout=TIMEOUT_S,
            verify=VERIFY_SSL,
        )
        r.raise_for_status()
        return r.json() if r.content else {}
    except Exception:
        return None

def _auth_email_from_jwt(jwt_token: Optional[str]) -> Optional[str]:
    token = _norm(jwt_token)
    if not token:
        return None
    me = _api_get_auth("/auth/me", token) or {}
    email = me.get("email")
    return _norm(email)

def _load_json(path: str, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def _save_json(path: str, data: Any):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def _car_card_html(car: Dict[str, Any]) -> str:
    car_id = car.get("carId") or car.get("id") or "?"
    img = car.get("image") or "assets/images/placeholder-car.png"
    make = (car.get("make") or "").strip()
    model = (car.get("model") or "").strip()
    year = car.get("year")
    body = car.get("bodyType") or car.get("body") or "—"
    fuel = car.get("fuel") or "—"
    mileage = car.get("mileage")
    mileage_txt = f"{mileage} km" if isinstance(mileage, int) else "—"
    price_txt = _fmt_eur(car.get("price"))
    details_href = f"http://localhost:4200/car-details/{car_id}"
    return (
        "<div class='car-card'>"
        f"<b>🚗 {make} {model}</b><br>"
        f"🆔 <b>ID:</b> {car_id}<br><br>"
        f"📌 <b>Body:</b> {body}<br>"
        f"⚡ <b>Fuel:</b> {fuel}<br>"
        f"📅 <b>Year:</b> {year or '—'}<br>"
        f"📏 <b>Mileage:</b> {mileage_txt}<br>"
        f"💶 <b>Price:</b> {price_txt}<br><br>"
        f"<img src='{img}' class='car-image' width='160' /><br><br>"
        f"<a href='{details_href}' target='_blank'>🔗 View details</a>"
        "</div>"
    )

def _resolve_email(tracker: Tracker) -> Optional[str]:
    metadata = tracker.latest_message.get("metadata", {}) or {}
    jwt_token = _norm(metadata.get("jwt"))
    email = _auth_email_from_jwt(jwt_token)
    if email:
        return email
    slot_or_meta = _norm(tracker.get_slot("user_email")) or _norm(metadata.get("user_email"))
    if slot_or_meta:
        return slot_or_meta
    env_default = _norm(os.getenv("CARBOT_DEFAULT_USER_EMAIL"))
    if env_default:
        return env_default
    return "guest@example.com"

ALLOWED_FUELS = {"petrol", "gasoline", "diesel", "hybrid", "electric", "ev"}
ALLOWED_BODIES = {
    "sedan", "suv", "hatchback", "coupe", "wagon", "estate",
    "pickup", "van", "mpv", "crossover", "minivan", "other"
}

_ANY_PAT = re.compile(
    r"^(any|anything|no|none|doesn.?t\s*matter|no\s*preference|whatever|anywhere|from\s*anywhere|it\s*doesn.?t\s*matter)$",
    re.IGNORECASE,
)
def _is_any(v: Optional[str]) -> bool:
    v = (v or "").strip().lower()
    return bool(_ANY_PAT.match(v))

_NUM_RE = r"(?:\d[\d\.,]*)"
def _extract_free_query(text: str) -> Dict[str, Any]:
    t = (text or "").lower().strip()
    body = None
    for b in sorted(ALLOWED_BODIES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(b)}\b", t):
            body = "wagon" if b == "estate" else b
            break
    max_price = None
    m = re.search(rf"(?:under|<=?|less than|below|max|up to)\s*({_NUM_RE})", t)
    if m:
        max_price = _to_float(m.group(1))
    min_year = None
    my = re.search(r"(?:min(?:imum)?|>=|from|since|after|newer than)\s*((?:19|20)\d{2})", t)
    if my:
        min_year = _to_int(my.group(1))
    if (max_price is None or min_year is None):
        nums = [n.replace(",", "").replace(".", "") for n in re.findall(_NUM_RE, t)]
        nums_int = [int(n) for n in nums if n.isdigit()]
        years = [n for n in nums_int if 1980 <= n <= 2035]
        prices = [n for n in nums_int if n >= 500 and n not in years]
        if min_year is None and years:
            min_year = max(years)
        if max_price is None and prices:
            max_price = min(prices)
    return {"body_type": body, "max_price": max_price, "min_year": min_year}

ANY_TOKENS = {
    "any", "all", "whatever", "whichever", "either",
    "no preference", "doesn't matter", "does not matter",
    "nothing specific", "no specific", "no particular",
    "i don't care", "i dont care", "don't care", "dont care",
    "idc", "anything", "none", "n/a", "na",
}

SKIPPABLE_SLOTS = {"body_type", "fuel", "max_price", "min_year", "max_mileage"}


def _is_any_text(v: Any) -> bool:
    return str(v).strip().lower() in ANY_TOKENS


class ValidateCarSearchForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_car_search_form"

    async def required_slots(
        self, slots_mapped_in_domain, dispatcher, tracker, domain
    ) -> List[Text]:
        last_text = (tracker.latest_message.get("text") or "").strip().lower()
        rs = tracker.get_slot("requested_slot")
        if rs in SKIPPABLE_SLOTS and last_text in ANY_TOKENS:
            return [s for s in slots_mapped_in_domain if s != rs]
        return list(slots_mapped_in_domain)

    def validate_body_type(self, value, dispatcher, tracker, domain):
        return {"body_type": None if _is_any_text(value) else (str(value).strip().lower() or None)}

    def validate_fuel(self, value, dispatcher, tracker, domain):
        if _is_any_text(value):
            return {"fuel": None}
        v = str(value).strip().lower()
        if v == "gasoline": v = "petrol"
        if v == "ev": v = "electric"
        return {"fuel": v or None}


    def validate_max_price(self, value, dispatcher, tracker, domain):
        if _is_any_text(value) or str(value).strip() == "":
            return {"max_price": None}
        f = _to_float(value)
        return {"max_price": f if (f is not None and f > 0) else None}

    def validate_min_year(self, value, dispatcher, tracker, domain):
        if _is_any_text(value) or str(value).strip() == "":
            return {"min_year": None}
        y = _to_int(value)
        return {"min_year": y if (y and 1900 <= y <= 2100) else None}

    def validate_max_mileage(self, value, dispatcher, tracker, domain):
        if _is_any_text(value) or str(value).strip() == "":
            return {"max_mileage": None}
        m = _to_int(value)
        return {"max_mileage": m if (m and m > 0) else None}




class ValidateCheckoutForm(FormValidationAction):
    def name(self) -> Text:
        return "validate_checkout_form"

    def validate_full_name(self, value: Any, dispatcher, tracker, domain):
        v = _norm(value)
        if v and len(v) >= 2:
            return {"full_name": v}
        return {"full_name": None}

    def validate_phone(self, value: Any, dispatcher, tracker, domain):
        v = _norm(value)
        if not v:
            return {"phone": None}
        if re.fullmatch(r"[+\d][\d ()\-]{5,}", v):
            return {"phone": v}
        return {"phone": None}

    def validate_address(self, value: Any, dispatcher, tracker, domain):
        v = _norm(value)
        if not v:
            return {"address": None}
        if len(v) >= 5:
            return {"address": v}
        return {"address": None}

class ActionSearchCar(Action):
    def name(self) -> Text:
        return "action_search_car"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict[Text, Any]):
        body_type   = _norm(tracker.get_slot("body_type"))
        fuel        = _norm(tracker.get_slot("fuel"))
        origin      = _norm(tracker.get_slot("origin"))
        max_price   = _to_float(tracker.get_slot("max_price"))
        min_year    = _to_int(tracker.get_slot("min_year"))
        max_mileage = _to_int(tracker.get_slot("max_mileage"))
        make        = _norm(tracker.get_slot("make"))
        model       = _norm(tracker.get_slot("model"))

        if not any([body_type, fuel, origin, max_price, min_year, max_mileage, make, model]):
            dispatcher.utter_message(text="Let's refine your search first.")
            return []
        
        params: Dict[str, Any] = {"sortBy": "yearDesc", "pageIndex": 0, "pageSize": 20}
        if body_type:   params["bodyType"]   = body_type
        if fuel:        params["fuel"]       = fuel
        if origin and origin.lower() not in {"any", "anywhere", "no", "none"}:
            params["origin"] = origin
        if max_price is not None:   params["maxPrice"]   = max_price
        if min_year is not None:    params["minYear"]    = min_year
        if max_mileage is not None: params["maxMileage"] = max_mileage
        if make:  params["make"]  = make
        if model: params["model"] = model

        data = _api_get("/cars/search", params) if API_BASE else None

        cars: List[Dict[str, Any]] = []
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            cars = data["items"]
        elif isinstance(data, list):
            cars = data

        if data is None:
            local = _load_json("cars.json", [])
            results = list(local)
            if body_type:
                results = [c for c in results if str(c.get("bodyType","")).strip().lower() == body_type.lower()]
            if fuel:
                results = [c for c in results if str(c.get("fuel","")).strip().lower() == fuel.lower()]
            if origin and origin.lower() not in {"any","anywhere","no","none"}:
                results = [c for c in results if str(c.get("origin","")).strip().lower() == origin.lower()]
            if max_price is not None:
                results = [c for c in results if _to_float(c.get("price")) is not None and float(c.get("price")) <= max_price]
            if min_year is not None:
                results = [c for c in results if _to_int(c.get("year")) is not None and int(c.get("year")) >= min_year]
            if max_mileage is not None:
                results = [c for c in results if _to_int(c.get("mileage")) is not None and int(c.get("mileage")) <= max_mileage]
            if make:
                results = [c for c in results if str(c.get("make","")).strip().lower() == make.lower()]
            if model:
                results = [c for c in results if str(c.get("model","")).strip().lower() == model.lower()]
            results.sort(key=lambda c: (-(_to_int(c.get("year")) or 0), (_to_int(c.get("mileage")) or 10**9)))
            cars = results

        if not cars:
            dispatcher.utter_message(text="I couldn't find cars matching your criteria. Try adjusting the filters.")
            return []

        for car in cars[:3]:
            dispatcher.utter_message(text=_car_card_html(car), html=True)
        return []



class ActionReserveCar(Action):
    def name(self) -> Text:
        return "action_reserve_car"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        car_id = _to_int(tracker.get_slot("car_id"))
        make   = _norm(tracker.get_slot("make"))
        model  = _norm(tracker.get_slot("model"))

        if not car_id and API_BASE and (make or model):
            params = {"make": make or "", "model": model or "", "pageIndex": 0, "pageSize": 1}
            found = _api_get("/cars/search", params) or {}
            items = found.get("items") if isinstance(found, dict) else []
            if items:
                car_id = _to_int(items[0].get("carId"))

        if not car_id:
            dispatcher.utter_message(text='Please specify the car ID (e.g., "reserve car 176").')
            return []

        added = _api_post("/cart/add", {"carId": int(car_id), "quantity": 1}, headers=_headers_from_tracker(tracker))
        if added is None:
            dispatcher.utter_message(text="I couldn't add that car to your cart.")
            return []

        dispatcher.utter_message(text=f"Starting checkout for car #{car_id}.")
        return [
            SlotSet("full_name", None),
            SlotSet("phone", None),
            SlotSet("address", None),
            FollowupAction("checkout_form"),
        ]

class ActionAddToCart(Action):
    def name(self) -> Text:
        return "action_add_to_cart"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        car_id = _to_int(tracker.get_slot("car_id"))
        if not car_id:
            text = tracker.latest_message.get("text") or ""
            m = re.search(r"\d{1,7}", text)
            if m:
                car_id = _to_int(m.group(0))

        if not car_id:
            dispatcher.utter_message(text='Tell me which car ID to add (e.g., "add 71 to my cart").')
            return []

        resp = _api_post("/cart/add", {"carId": int(car_id), "quantity": 1}, headers=_headers_from_tracker(tracker))
        if resp is None:
            dispatcher.utter_message(text="I couldn't add that to your cart.")
            return []
        dispatcher.utter_message(text=f"✅ Added #{car_id} to your cart.")
        dispatcher.utter_message(json_message={"event": "cart_updated"})
        return []

class ActionShowCart(Action):
    def name(self) -> Text:
        return "action_show_cart"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        data = _api_get("/cart", headers=_headers_from_tracker(tracker)) or {}
        items = data.get("items", []) if isinstance(data, dict) else []
        if not items:
            dispatcher.utter_message(text="Your cart is empty.")
            return []

        lines = ["🛒 Cart:"]
        for it in items[:10]:
            car = it.get("car", {}) or {}
            title = f"[#{car.get('carId')}] {(car.get('make') or '').strip()} {(car.get('model') or '').strip()}".strip()
            price = it.get("price", car.get("price", 0))
            qty = it.get("quantity", 1)
            lines.append(f"• {title} ×{qty} — {_fmt_eur(price)}")
        dispatcher.utter_message(text="\n".join(lines))
        return []

class ActionClearCart(Action):
    def name(self) -> Text:
        return "action_clear_cart"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        resp = _api_post("/cart/clear", {}, headers=_headers_from_tracker(tracker))
        if resp is None:
            dispatcher.utter_message(text="Hmm, I couldn't clear your cart.")
            return []
        dispatcher.utter_message(text="🧹 Cart cleared.")
        dispatcher.utter_message(json_message={"event": "cart_cleared"})
        dispatcher.utter_message(json_message={"event": "cart_updated"})
        return []

class ActionRemoveFromCart(Action):
    def name(self) -> Text:
        return "action_remove_from_cart"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        car_id = _to_int(tracker.get_slot("car_id"))
        if not car_id:
            text = tracker.latest_message.get("text") or ""
            m = re.search(r"\d{1,7}", text)
            if m:
                car_id = _to_int(m.group(0))

        if not car_id:
            dispatcher.utter_message(text='Tell me which car ID to remove (e.g., "remove 71 from my cart").')
            return []

        data = _api_get("/cart", headers=_headers_from_tracker(tracker)) or {}
        items = data.get("items", []) if isinstance(data, dict) else []
        cart_item_id = None
        for it in items:
            car = (it or {}).get("car", {}) or {}
            if int(car.get("carId") or 0) == int(car_id):
                cart_item_id = it.get("cartItemId")
                break

        if not cart_item_id:
            dispatcher.utter_message(text="That car is not in your cart.")
            return []

        ok = _api_delete(f"/cart/item/{int(cart_item_id)}", headers=_headers_from_tracker(tracker))
        if not ok:
            dispatcher.utter_message(text="I couldn't remove that item.")
            return []
        dispatcher.utter_message(text=f"🗑️ Removed #{car_id} from your cart.")
        dispatcher.utter_message(json_message={"event": "cart_updated"})
        return []

class ActionCheckoutCart(Action):
    def name(self) -> Text:
        return "action_checkout_cart"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        metadata = tracker.latest_message.get("metadata", {}) or {}
        jwt_token = _norm(metadata.get("jwt"))
        if not jwt_token:
            dispatcher.utter_message(text="Please log in on the site first, then try checkout again.")
            return []

        cart = _api_get("/cart", headers=_headers_from_tracker(tracker)) or {}
        items = cart.get("items", []) if isinstance(cart, dict) else []
        if not items:
            dispatcher.utter_message(text="Your cart is empty.")
            return []

        me = _api_get_auth("/auth/me", jwt_token) or {}
        default_full_name = me.get("fullName") or me.get("email") or "Customer"
        default_email = me.get("email")

        full_name = _norm(tracker.get_slot("full_name")) or default_full_name
        phone = _norm(tracker.get_slot("phone"))
        address = _norm(tracker.get_slot("address"))

        order_items = []
        for it in items:
            car = (it or {}).get("car", {}) or {}
            car_id = _to_int(car.get("carId"))
            qty = _to_int(it.get("quantity")) or 1
            if car_id:
                order_items.append({"carId": car_id, "quantity": qty})

        if not order_items:
            dispatcher.utter_message(text="I couldn't build the order items from your cart.")
            return []

        payload = {
            "fullName": full_name,
            "email": default_email,
            "phone": phone,
            "address": address,
            "items": order_items,
        }

        created = _api_post_auth("/orders", payload, jwt_token)
        if not created or not created.get("orderId"):
            dispatcher.utter_message(text="Sorry, I couldn't place the order right now.")
            return []

        _ = _api_post("/cart/clear", {}, headers=_headers_from_tracker(tracker))

        oid = created.get("orderId")
        dispatcher.utter_message(text=f"✅ Order placed! Your order number is #{oid}.")
        dispatcher.utter_message(json_message={"event": "order_placed", "orderId": oid})
        dispatcher.utter_message(json_message={"event": "cart_cleared"})
        dispatcher.utter_message(json_message={"event": "cart_updated"})

        return [
            SlotSet("full_name", None),
            SlotSet("phone", None),
            SlotSet("address", None),
        ]

class ActionCancelReservation(Action):
    def name(self) -> Text:
        return "action_cancel_reservation"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        user_email = _resolve_email(tracker)
        if not user_email:
            dispatcher.utter_message(text="Please provide your email to cancel an order.")
            return []

        order_id = _to_int(tracker.get_slot("order_id"))

        if order_id and API_BASE:
            if _api_delete(f"/orders/{order_id}", params={"user": user_email}):
                dispatcher.utter_message(text=f"❌ Order #{order_id} has been canceled.")
                dispatcher.utter_message(json_message={"event": "order_canceled", "orderId": order_id})
                return []
            resp = _api_post("/orders/cancel", {"user": user_email, "orderId": order_id})
            if resp is not None:
                dispatcher.utter_message(text=f"❌ Order #{order_id} has been canceled.")
                dispatcher.utter_message(json_message={"event": "order_canceled", "orderId": order_id})
                return []
            dispatcher.utter_message(text=f"I couldn't cancel order #{order_id}.")
            return []

        dispatcher.utter_message(text='Tell me the order ID (e.g., "cancel order 123").')
        return []

class ActionOrderStatus(Action):
    def name(self) -> Text:
        return "action_order_status"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        user_email = _resolve_email(tracker)
        if not user_email:
            dispatcher.utter_message(text="Please provide your email to check order status.")
            return []

        orders = _api_get("/orders/by-email", {"user": user_email}) if API_BASE else None
        orders = orders if isinstance(orders, list) else []
        if not orders:
            dispatcher.utter_message(text="You have no orders.")
            return []

        lines = []
        for o in orders[:5]:
            oid = _to_int(o.get("orderId"))
            total = _fmt_eur(o.get("total"))
            rating = o.get("rating")
            items = o.get("items") or []
            names = ", ".join([
                f"{(it.get('make') or '').strip()} {(it.get('model') or '').strip()}".strip()
                for it in items[:3] if (it.get('make') or it.get('model'))
            ])
            txt = f"Order #{oid} — {total}"
            if rating:
                txt += f" — ⭐ {rating}/5"
            if names:
                txt += f" — {names}"
            lines.append(txt)
        dispatcher.utter_message(text="\n".join(lines))
        return []

class ActionResetFilters(Action):
    def name(self) -> Text:
        return "action_reset_filters"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        dispatcher.utter_message(text="Filters have been reset. Let's start a new search!")
        to_reset = ["make","model","body_type","fuel","origin","max_price","min_year","max_mileage","color","car_id","order_id"]
        return [SlotSet(k, None) for k in to_reset]

class ActionDebugSlots(Action):
    def name(self) -> Text:
        return "action_debug_slots"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        keys = ["make","model","body_type","fuel","origin","max_price","min_year","max_mileage","color","car_id","order_id","user_email","session_id","full_name","phone","address"]
        snap = {k: tracker.get_slot(k) for k in keys}
        dispatcher.utter_message(text="Current slot values:\n" + json.dumps(snap, indent=2, ensure_ascii=False))
        return []

class ActionSessionStart(Action):
    def name(self) -> Text:
        return "action_session_start"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        events: List = [SessionStarted()]
        metadata = tracker.latest_message.get("metadata", {}) or {}
        jwt_token = _norm(metadata.get("jwt"))
        email = _auth_email_from_jwt(jwt_token) or _norm(metadata.get("user_email")) or _norm(os.getenv("CARBOT_DEFAULT_USER_EMAIL")) or "guest@example.com"
        sid = _norm(metadata.get("session_id")) or _norm(metadata.get("sid")) or "bot-session"
        events.append(SlotSet("user_email", email))
        events.append(SlotSet("session_id", sid))
        events.append(ActionExecuted("action_listen"))
        return events

class ActionDefaultFallback(Action):
    def name(self) -> Text:
        return "action_default_fallback"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        text = tracker.latest_message.get("text") or ""
        parsed = _extract_free_query(text)
        body = parsed.get("body_type")
        max_price = parsed.get("max_price")
        min_year = parsed.get("min_year")
        if body or max_price or min_year:
            events: List = []
            if body:
                events.append(SlotSet("body_type", body))
            if max_price is not None:
                events.append(SlotSet("max_price", max_price))
            if min_year is not None:
                events.append(SlotSet("min_year", min_year))
            dispatcher.utter_message(text="Searching cars matching your filters...")
            return events + [FollowupAction("action_search_car")]
        dispatcher.utter_message(text="Sorry, I didn’t understand. Can you rephrase? 🙂")
        return []

class ActionCancelCheckout(Action):
    def name(self) -> Text:
        return "action_cancel_checkout"

    def run(self, dispatcher: CollectingDispatcher, tracker: Tracker, domain: Dict):
        dispatcher.utter_message(text="Checkout canceled.")
        return [
            SlotSet("full_name", None),
            SlotSet("phone", None),
            SlotSet("address", None),
        ]
