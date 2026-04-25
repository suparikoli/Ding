# ding

> A Frappe / ERPNext app that turns the desk into a **client-communication and field-sales hub** — telecalling, WhatsApp messaging, day-level beat planning on a map, agent tracking, and a mobile PWA — all driven from the same Lead / Customer / Contact records you already have.

---

## What it is

`ding` started as a thin telecalling helper (one click to call or WhatsApp the contact you're looking at) and has grown into a complete **field-sales-and-servicing toolkit**:

- **Communication layer** — tel / WhatsApp / call-log integrations on every Lead, Customer, and Contact form.
- **Field Sales module** — day-level beat planning ("Plan a Day on Map"), sequenced visit stops, route optimization across six maps providers, full visit lifecycle, photo + signature + expense capture, manager live tracking.
- **Mobile** — a desk page for agents (`/app/my-field-day`) and an installable PWA (`/field/`) with offline-queue.
- **Analytics** — number cards, dashboard charts, six reports, four notifications.

Built on Frappe v15+. Optional ERPNext integration for Opportunity / Quotation / Sales Order / Issue / Maintenance Visit / Stock Entry / Payment Entry creation from inside a visit.

---

## Communication features

These are the original `ding` capabilities — they work on every standard Lead, Customer, and Contact form. Configurable via **Ding Settings** (`/app/ding-settings`).

- **One-click voice call** — "📞 Ding Mobile" / "📞 Ding Phone" buttons fire a `tel:` link from the form, with an optional notification sound.
- **WhatsApp messaging** — direct-to-mobile and direct-to-phone WhatsApp buttons with `wa.me/` deep-links.
- **Templated WhatsApp messages** sourced from Ding Settings:
  - *Company Profile* — sends greeting + company-profile PDF link + website + eCommerce URL
  - *Price List* — sends greeting + price-list PDF link
- **Templated greeting** uses the right field per doctype (`lead_name` / `customer_name` / `first_name`). Buttons hide automatically when a URL isn't configured, so the same code ships across tenants without hardcoded brand links.
- **Call Logs** — every desk-initiated call records a `Ding Call Logs` document with:
  - Outgoing / Incoming type
  - Auto-set `call_handler = session user`, `start_time = now`, computed `duration` from start/end
  - 100+-option *Disposition* select (Interested, Considering, Wrong Number, Decision Pending, Order Placed, Payment Pending, …)
  - 11-stage *Relation* select (Acknowledgment → Acquaintance → Trustworthy → Partnership → Enduring)
  - `Ding Action List` child rows logging exactly what happened post-call (130+ standard actions: "Sent Follow-up Email", "Scheduled Callback", "Quotation Provided", "Marked as DNC", "Verified Correct Contact Details", …) — pick from the list or check the `taken` flag with a free-text description
  - Ties back to the originating Lead / Customer / Contact via `reference_doctype` + `reference_docname`
- **Call Logs list view** — filter by type, status, agent, dates; list and report views ship out-of-the-box.
- **List shortcuts on the parent form** — "📋 Call Logs" button on Lead/Customer/Contact filters call history for that specific record.
- **Open the corresponding parent record** — "Update Lead/Customer/Contact Location" jumps from a Meet form to the parent in a new tab when its geolocation is missing.

Custom fields auto-installed on Lead, Customer, and Contact:
- `lead_geolocation` / `customer_geolocation` / `contact_geolocation` (Geolocation, with Leaflet/OSM map widget — drag pin, search, "use my location")

---

## Field Sales features

### Plan a Day on Map (manager-only)

`/app/plan-day-on-map` is the headline manager workflow. Single-page app with:

- **Map** showing all geolocated Leads (yellow), Customers (blue), Contacts (green) — clicking a marker adds it to the plan; clicking again removes it
- **Sequenced sidebar** with stop #, drag/up-down reorder, per-stop visit type & objective edit
- **Optimize Sequence** button — local nearest-neighbour + 2-opt swap (or provider-side road-distance optimization when configured)
- **Save as Draft** vs **Save & Release** — release fires the agent's "Day Plan Released" notification automatically
- Loads any existing plan for the chosen `(agent, date)` so the manager can edit instead of creating duplicates
- Filter clients by territory + by type + by search
- Live route polyline + planned-distance summary as you click

### Day Plan + Visit Stop

A **submittable** parent doctype with sequenced child rows:

- **Lifecycle**: `Draft → Released → In Progress → Completed | Cancelled` with state colours
- **Drag-to-reorder** stops in the form's table; sequence numbers auto-renumber
- **"Optimize Sequence"** + **"Open in Maps"** + **"Apply Template"** buttons
- **Stop quick-actions** (Start / End / Skip) usable directly from the table
- Per-stop fields: `client_doctype` + Dynamic Link, `visit_type` (Sales / Demo / Service / Delivery / Collection / Survey / Other), `priority`, `planned_start_time`, `planned_duration`, `time_window_start/end`, `objective`, `linked_doctype/name` (for service tickets / sales orders), `survey_web_form` (for survey-type stops), `meet_doctype/name` back-link, `actual_start_time`, `actual_duration`
- **Embedded route preview map** on the form
- Auto-rolled summaries: planned/completed/skipped/no-show counts, planned/actual minutes, planned distance, adherence %

### Maps & routing

A pluggable provider abstraction (`field_sales/maps.py`):

| Provider | Tiles | Geocoding | Directions URL | Distance Matrix | Route Optimization |
|---|---|---|---|---|---|
| **Google** *(default)* | ✓ | ✓ | ✓ | ✓ | matrix + 2-opt |
| OpenStreetMap | ✓ | Nominatim | ✓ (Google deep-link) | Haversine | Haversine + 2-opt |
| OpenRouteService | – | ✓ | ✓ | ✓ road | ORS Optimization API |
| OSRM | – | – | ✓ | ✓ road | OSRM `/trip` (true TSP) |
| Mapbox | ✓ | ✓ | ✓ | ✓ | matrix + 2-opt |
| HERE | ✓ | ✓ | ✓ | ✓ | matrix + 2-opt |

Configured in **Field Sales Settings** (`/app/field-sales-settings`). Falls back to OpenStreetMap when no API key is configured.

### Visit lifecycle & capture

On Lead Meet / Customer Meet / Contact Meet:

- **Status pills**: 📋 Planned · 🚗 En route · 📍 Checked in · ✅ Completed · 🚫 No Show · ✖ Cancelled (with ⚠ prefix when off-target)
- **Off-target enforcement** — distance > `Field Sales Settings.off_target_threshold_meters` (default 500m) flags the meet and **requires a comment before submit**
- **No-show auto-detection** — `duration < 60s` on submit → status flipped to "No Show"
- **Concurrent-meet guard** — an agent can't have two `Checked in` meets at the same time
- **Abandoned check-in sweep** — hourly scheduler closes meets stuck "Checked in" for > `abandoned_checkin_minutes` (default 120) and marks them No Show
- **Convert-to-next-step buttons** — gated by `visit_type`:
  - `Sales` / `Demo` on Lead Meet → **Create Opportunity**
  - `Sales` / `Demo` on Customer Meet → **Create Quotation** / **Create Sales Order**
  - `Service` → **Create / Update Issue**
  - `Delivery` (with linked Delivery Note) → **Open Delivery Note**
  - `Collection` → **Record Payment** (Payment Entry pre-filled from linked Sales Invoice)
- **Photo + signature** — `check_in_photo` (Attach Image — opens device camera on mobile) + `customer_signature` (Signature touch canvas)
- **Field Visit Expense** child table — Fuel / Toll / Food / Parking / Sample / Other, with kms (when fuel) and receipt attachment, auto-rolled `total_expense`
- **Service section** (visible when `visit_type='Service'`) — `service_started_at`, `service_completed_at`, `customer_satisfied`, `parts_used` child table → optional automatic Stock Entry on submit
- **In-visit order capture** (Customer Meet, `visit_type='Sales'/'Demo'`) — `Field Visit Item` child with item_code, qty, rate, discount; auto-rolled `visit_total`
- **Collection** (Customer Meet, `visit_type='Collection'`) — `payments_collected` child with sales_invoice, amount, mode; auto-rolled `total_collected`
- **Customer feedback** — `feedback_rating`, `feedback_text`, optional `nps_score` (0–10)
- **Intel** section (all visit types) — `competitor_findings` (competitor, SKU, price, promo, photo) + `samples_distributed` (item, qty, recipient, signature)

### Visit Plan Templates

`/app/visit-plan-template` — define a saved list of clients and apply it to a Day Plan in one click. Solves "every month I visit these 12 customers" without a recurrence engine.

### Beat sequencing options

- **From the map** (preferred): Plan a Day on Map page
- **Bulk from list view**: select multiple Leads / Customers / Contacts → menu → "Add to Day Plan…"
- **One-off**: "📅 Plan visit" button on a single Lead / Customer / Contact form
- **From a template**: "Apply Template" on the Day Plan form

---

## Mobile

### My Field Day (`/app/my-field-day`)

Agent's mobile-friendly desk page:
- Big primary CTA: **▶ Start: <next stop>** → **✋ End: <current stop>**
- Map preview with sequenced markers + route polyline (Google / OSM)
- Tappable stop cards with Start / End / Skip / Navigate / Open Survey buttons
- Auto-pings `heartbeat` every 5 min while open

### Installable PWA at `/field/`

Vanilla-JS progressive web app served from `ding/www/field/`:
- Two views, role-aware: **My Day** (agent) and **Team** (manager-only)
- Service worker caches the shell + API responses
- **Offline queue**: stop actions and heartbeats are stored in `localStorage` if offline and replayed on `online`
- Big CTA + agent map preview (same UX as the desk page)
- Manifest, icons, dark theme

### Manager live map (`/app/manager-map`)

- Live agent positions on Google / OSM tiles (last heartbeat per agent, last 30 min by default)
- Today's plans listed in a sidebar with adherence %; click → opens the Day Plan
- Auto-refreshes every 60 seconds

### Heartbeat & geofencing

`Field Rep Heartbeat` doctype (high-volume, append-only):
- Auto-purged after 90 days
- `heartbeat()` API endpoint stores `(rep, timestamp, geolocation, accuracy_m)` and computes `inside_geofence_of` if within `Field Sales Settings.geofence_radius_m` (default 100m) of any planned stop in today's Day Plan

---

## Analytics & dashboards

### Workspace number cards

Pinned at the top of `/app/field-sales`:
- Today's planned visits
- Today's completed visits
- Active agents (heartbeat in last 30 min)
- Open Day Plans today
- Off-target visits in last 7 days

### Dashboard charts

- Visits per day (line, last month)
- Adherence % over 30 days (bar)
- Visits by type (group-by donut, last 30 days)

### Reports (Script Reports)

| Report | Purpose |
|---|---|
| **Day Plan Adherence** | Per-plan: planned, done, skipped, no-show, adherence %, time, distance |
| **Time on Territory** | Per-agent × visit_type total + average duration |
| **Off-target Leaderboard** | Agents ranked by % off-target visits + avg distance |
| **Conversion Funnel** | Lead Meet → Opportunity → Quotation → Sales Order |
| **Travel Kilometers** | Per-day actual km from heartbeats; falls back to planned km |
| **Route Efficiency** | Planned vs actual route per Day Plan with divergence-% flag (≥30% flagged) |

### Notifications (auto-fire)

- Off-target Check-in → manager
- Day Plan Released → assigned agent
- Abandoned Check-in → manager
- End of Day Adherence → manager (on Day Plan submit)

All four are standard Frappe Notification docs at `/app/notification` — admins can edit recipients, channels, conditions, and message templates.

### Print formats

- **Day Plan Card** — clean, printable / emailable plan summary with sequenced stops, status pills, and adherence

---

## Permissions / RBAC

Two app-shipped roles plus the standard `System Manager`:

| Role | Day Plan | Meet doctypes | Visit Stop | Heartbeat | Reports | Settings | Plan-on-Map page |
|---|---|---|---|---|---|---|---|
| `Field Agent` | own | own | inherits | own | – | read | – |
| `Field Operations Manager` | full | full | inherits | full | ✓ | full | ✓ |
| `System Manager` | full | full | full | full | ✓ | full | ✓ |

Enforced via `permission_query_conditions` + `has_permission` in `hooks.py`. The `guard_concurrent_meet` doc_event also blocks an agent from having two open meets at once across the three Meet doctypes.

---

## Whitelisted API surface

All under `ding.field_sales.api`:

| Endpoint | Purpose |
|---|---|
| `get_today_plan(date, user)` | Agent's plan for the day |
| `add_to_day_plan(client_doctype, client_name, agent, plan_date, visit_type, objective)` | Idempotent single-stop add |
| `plan_day_for_agent(agent, plan_date, stops, release)` | Bulk create / replace a Day Plan |
| `list_geolocated_clients(include, territory, search, limit)` | Map planner data source |
| `stop_action(plan_name, stop_row, action, payload)` | start / end / skip a stop |
| `heartbeat(lat, lng, accuracy_m)` | Mobile location ping + geofence check |
| `team_live_positions(within_minutes)` | Manager: latest heartbeat per agent |
| `team_today_plans()` | Manager: team's Day Plans for today |
| `get_maps_config()` | Maps provider + (browser-visible) API key |

Plus DocType-attached methods:

| Method | Purpose |
|---|---|
| `Day Plan.optimize_day_plan(plan_name)` | Re-sequence via maps provider's optimization (or local 2-opt fallback) |
| `Day Plan.directions_url_for_plan(plan_name)` | Build a deep-link to the configured directions provider |
| `Visit Plan Template.apply_template(template, plan_name, plan_date, agent)` | Stamp a template onto a Day Plan |

---

## Tech / install

- **Frappe v15+** (tested on v16) target
- **PWA**: vanilla JS, no framework. ~600 lines.
- **Maps abstraction**: `field_sales/maps.py` — pure-Python HTTP client with provider-specific `geocode` / `directions_url` / `distance_matrix` / `optimize_route`. Falls back to OSM/Haversine on any failure.
- **Background jobs**: `hourly` (`sweep_abandoned_checkins`), `daily` (`purge_old_heartbeats`).
- **Migrations**: 5 patches in 4 versions (v1.0 → v1.3) — idempotent, safe to re-run.
  - v1.0 — Bootstrap roles
  - v1.1 — Pre+post-sync fieldtype migration (Data → Geolocation / Datetime / Duration / Float)
  - v1.2 — Workspace number cards, dashboard charts, notifications
  - v1.3 — Default `maps_provider` to Google
- **Tests**: `field_sales.test_utils`, `test_routing`, `test_api`, plus per-doctype tests under `field_sales/doctype/*/test_*.py`.

### On a fresh Frappe site

```bash
bench get-app https://github.com/<your-org>/ding   # adjust to your fork
bench --site <site> install-app ding
bench --site <site> migrate
bench build --app ding
bench clear-cache
```

Then open `/app/field-sales-settings` and add your **Google Maps API key** (or pick a different provider) to unlock the rich map UI.

### Configuration entry points

| URL | Purpose |
|---|---|
| `/app/field-sales-settings` | Maps provider, geofence radius, off-target threshold, default visit duration, heartbeat interval, auto-stock-entry flag |
| `/app/ding-settings` | Communication: company profile / website / eCommerce / price-list URLs used by WhatsApp templates |
| `/app/role/Field Agent` · `/app/role/Field Operations Manager` | Two roles auto-created on install |

---

## Module map

```
ding/
├── README.md  ← this file
├── ding/
│   ├── ding/                              # Communication (telecalling) module
│   │   └── doctype/
│   │       ├── ding_call_logs/
│   │       ├── ding_action_list/          # 130+ post-call dispositions
│   │       └── ding_settings/             # Single — WhatsApp template URLs
│   ├── field_sales/                       # Field-sales module
│   │   ├── api.py                         # whitelisted endpoints
│   │   ├── maps.py                        # 6-provider abstraction
│   │   ├── routing.py                     # NN + 2-opt fallback
│   │   ├── meet_lifecycle.py              # off-target, no-show, status auto-advance
│   │   ├── rollup.py                      # Meet → Visit Stop sync
│   │   ├── permissions.py                 # query conditions + concurrent-meet guard
│   │   ├── scheduler.py                   # hourly sweep + daily purge
│   │   ├── doctype/                       # 16 doctypes (Day Plan, Visit Stop, …)
│   │   ├── page/                          # plan-day-on-map · my-field-day · manager-map
│   │   ├── report/                        # 6 script reports
│   │   ├── workspace/field_sales/
│   │   ├── print_format/day_plan_card/
│   │   └── README.md
│   ├── public/js/                         # field_maps.js · plan_visit_bulk.js
│   ├── www/field/                         # installable PWA
│   ├── patches/                           # v1_0 · v1_1 · v1_2 · v1_3
│   ├── hooks.py
│   └── install.py
├── pyproject.toml
└── license.txt
```

---

## License

MIT

---

> Author: manoj@mith.tech · Built on Frappe and ERPNext.
