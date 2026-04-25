# Field Sales — `ding.field_sales`

A field sales & servicing module for Frappe. Drives any visit-based work — sales calls, demos, service jobs, deliveries, collections, surveys — with day-level beat planning, route optimization across 6 maps providers, lifecycle and capture, manager tracking, and an installable PWA for both agents and managers.

This README is for maintainers and integrators. End-user docs live in the in-product help text.

---

## DocType map

```
Day Plan ──┬─< Visit Stop ──── creates ──> Lead Meet / Customer Meet / Contact Meet
            │                                    │
            │                                    ├─< Field Visit Expense
            │                                    ├─< Field Visit Part            (visit_type=Service)
            │                                    ├─< Field Visit Item            (visit_type=Sales/Demo, Customer Meet only)
            │                                    ├─< Field Visit Payment         (visit_type=Collection, Customer Meet only)
            │                                    ├─< Field Visit Competitor Finding
            │                                    └─< Field Visit Sample
            │
            └── status, summaries, adherence_pct (auto-rolled from stops & meets)

Visit Plan Template ──< Visit Plan Template Row   (saved list applied to a Day Plan on demand)

Field Sales Settings  (Single, all global config)
Field Rep Heartbeat   (high-volume append-only mobile pings)

Field Visit Route Planning  (legacy multi-day planner; superseded by Day Plan but retained)
Field Visit Lead/Customer/Contact Locations  (legacy children of Route Planning)
```

### Lifecycle (Meet)

```
Planned → En route → Checked in → Completed
                                ↘ No Show     (auto when duration < 60s on submit, or scheduler-swept)
                                ↘ Cancelled   (manual)
```

### Lifecycle (Day Plan)

```
Draft → Released → In Progress → Completed
                              ↘ Cancelled
```

The Day Plan submit button is hard-blocked when stops are still `Pending` / `In Progress` (override available to Field Operations Manager).

---

## Code map

```
field_sales/
├── api.py                  — whitelisted endpoints (PWA + Frappe pages)
├── maps.py                 — 6-provider abstraction (geocode, directions, matrix, optimize)
├── meet_lifecycle.py       — shared validate / before_submit / on_submit hooks for Meets
├── permissions.py          — query conditions + has_permission + concurrent-meet guard
├── rollup.py               — Meet → Visit Stop status mirror
├── routing.py              — local NN + 2-opt fallback for route optimization
├── scheduler.py            — hourly + daily background jobs
├── utils.py                — parse_geo, to_geojson_point, haversine_meters

├── doctype/                — 16 doctypes (see DocType map)
├── page/                   — My Field Day, Manager Map (Frappe desk pages)
├── report/                 — 6 script reports
├── print_format/           — Day Plan Card
├── workspace/field_sales/  — workspace JSON
└── README.md               — this file

../patches/                 — versioned migrations (v1_0..v1_2)
../www/field/               — installable PWA (HTML + JS + service worker + manifest)
```

---

## Whitelisted API

All in `ding.field_sales.api`. Server-side RBAC is enforced — `Field Agent` sees only their own data; `Field Operations Manager` and `System Manager` see the team.

| Endpoint | Caller | Purpose |
|---|---|---|
| `get_today_plan(date=None, user=None)` | agent / manager | Returns the calling user's Day Plan + visits. Managers may pass `user`. |
| `add_to_day_plan(client_doctype, client_name, agent=None, plan_date=None, visit_type='Sales', objective='')` | desk + PWA | Adds a stop to (or creates) a Day Plan. Idempotent. |
| `stop_action(plan_name, stop_row, action, payload='')` | agent | `action ∈ {start, end, skip}`. `start` creates the right Meet doc and links it back. `skip` requires `payload` as the reason. |
| `heartbeat(lat, lng, accuracy_m=None)` | agent (PWA) | Appends a Field Rep Heartbeat row. Returns geofence status when within `Field Sales Settings.geofence_radius_m` of a planned stop. |
| `team_live_positions(within_minutes=30)` | manager | Latest heartbeat per agent in the window. |
| `team_today_plans()` | manager | Today's Day Plans across the team with summary fields. |

Two more whitelisted entry points live on Day Plan:

| Method | Purpose |
|---|---|
| `ding.field_sales.doctype.day_plan.day_plan.optimize_day_plan(plan_name)` | Re-sequences the plan's stops via `maps.optimize_route` (provider-specific or local 2-opt fallback). |
| `ding.field_sales.doctype.day_plan.day_plan.directions_url_for_plan(plan_name)` | Builds an "Open in Maps" deep-link via the configured directions provider. |

And on Visit Plan Template:

| Method | Purpose |
|---|---|
| `ding.field_sales.doctype.visit_plan_template.visit_plan_template.apply_template(template, plan_name=None, plan_date=None, agent=None)` | Append the template's rows to a Day Plan; idempotent. |

---

## Maps & routing providers

Configured in **Field Sales Settings** (Single):

| Provider | Tiles | Geocode | Directions URL | Distance Matrix | Route Optimization | Cost / Notes |
|---|---|---|---|---|---|---|
| **OpenStreetMap** *(default)* | OSM | Nominatim | Google URL deep-link | Haversine | NN + 2-opt | free, no API key |
| **OpenRouteService** | OSM | ORS Geocode | ORS or Google URL | ORS Matrix | ORS Optimization API | free 2k/day, 40/min |
| **OSRM** | OSM | (falls back to Nominatim) | OSRM `/route` | OSRM `/table` | OSRM `/trip` | free if self-hosted; demo URL has fair-use limits |
| **Mapbox** | Mapbox tiles | Mapbox Geocode | Mapbox URL | Mapbox Matrix | (uses matrix + local 2-opt) | 50k tile loads/mo free |
| **Google** | Google tiles (in PWA) | Google Geocode | Google URL | Google Distance Matrix | (uses matrix + local 2-opt) | $200/mo free credit |
| **HERE** | HERE tiles | HERE Geocode | (falls back to Google URL) | HERE Matrix | (uses matrix + local 2-opt) | 250k tx/mo free |

### How dispatch works

`maps.optimize_route(start, stops, time_windows)`:

1. If provider is **ORS** or **OSRM** with a working endpoint, call its native VRP/TSP.
2. Otherwise build a distance matrix via `distance_matrix(points)` — road-based when `enable_road_distance_optimization=1`, else Haversine.
3. Pass the matrix to the local NN-seed + 2-opt solver in `routing.py`.

Anywhere a provider call fails (no key, network, etc.), the function logs a warning and falls back to the OSM/Haversine default. The agent's day still works.

`maps.directions_url(origin, destination, waypoints)` honours `directions_provider` separately so the "Open in Maps" button can deep-link to Google even when the rest of the app is on Mapbox tiles.

---

## RBAC

Two app-shipped roles plus the standard `System Manager`:

| Role | Day Plan | Meet doctypes | Visit Stop | Heartbeat | Reports | Settings |
|---|---|---|---|---|---|---|
| `Field Agent` | own (assigned_to) — submit own plan | own (creator) | inherit | own (rep) — create only | — | read |
| `Field Operations Manager` | full team | full team | inherit | full team | yes | full |
| `System Manager` | full | full | full | full | yes | full |

The filtering is enforced by `permission_query_conditions` in `hooks.py` plus `has_permission` for record-level checks. Sales users without one of these roles see nothing.

`permissions.guard_concurrent_meet` (wired via `doc_events.validate`) also blocks an agent from having two open Meets at once across the three doctypes.

---

## Mobile

### Light path — `/app/my-field-day`

Single-screen Frappe Page with today's plan as tappable cards. Calls the same whitelisted endpoints as the PWA. Pings `heartbeat` every 5 minutes once loaded. Ships in the same `bench build` as the rest of the app.

### Heavy path — `/field/` (PWA)

Installable progressive web app served from `ding/www/field/`. Two views (agent / manager) chosen by URL hash, role-aware. Service worker caches the shell + API responses. Stop actions and heartbeats are queued in `localStorage` if offline and replayed on `online`. Manifest, icons, and CSS dark theme included.

---

## Background jobs

```
hourly:  ding.field_sales.scheduler.sweep_abandoned_checkins
daily:   ding.field_sales.scheduler.purge_old_heartbeats
```

`sweep_abandoned_checkins` closes any Meet checked in for longer than `Field Sales Settings.abandoned_checkin_minutes` (default 120) — sets `status='No Show'` and propagates to the linked Visit Stop.

`purge_old_heartbeats` deletes heartbeats older than 90 days (configurable via the function's `days` arg).

---

## Reports

| Report | Purpose |
|---|---|
| Day Plan Adherence | Per-plan: planned, done, skipped, no-show, adherence %, time, distance |
| Time on Territory | Per-agent × visit_type total + average duration |
| Off-target Leaderboard | Agents ranked by % off-target visits and avg distance |
| Conversion Funnel | Lead Meet → Opportunity → Quotation → Sales Order |
| Travel Kilometers | Per-day actual km from heartbeats; falls back to planned |
| Route Efficiency | Planned-vs-actual route divergence per Day Plan, ≥30% flagged |

---

## Notifications (post_model_sync patch creates these)

- **Field Sales: Off-target Check-in** — manager ping when `off_target` flips true
- **Field Sales: Day Plan Released** — agent notified when their plan is released
- **Field Sales: Abandoned Check-in** — manager notified when scheduler auto-closes a Meet
- **Field Sales: End of Day Adherence** — manager summary on Day Plan submit

All four are standard Frappe Notification docs — admins can edit recipients, channels, conditions, and message templates from `/app/notification`.

---

## Migration history

| Version | Patch | What it does |
|---|---|---|
| v1.0 | `bootstrap_field_sales_roles` | Creates `Field Agent` + `Field Operations Manager` roles |
| v1.1 | `snapshot_pre_geo_data` (pre) + `restore_post_geo_data` (post) | Converts legacy `Data` fields to `Geolocation` / `Datetime` / `Duration` / `Float`. Idempotent. |
| v1.2 | `create_workspace_assets` + `create_notifications` | Creates 5 number cards, 3 dashboard charts, 4 notifications. Idempotent. |

---

## Maintenance commands

```bash
# Day-to-day
bench --site <s> migrate                             # picks up doctype + patch changes
bench build --app ding                               # rebuilds JS/CSS/PWA
bench clear-cache
bench --site <s> run-tests --app ding                # runs all unit + integration tests

# Re-run the maps assets patch (e.g. after adjusting NUMBER_CARDS)
bench --site <s> execute ding.patches.v1_2.create_workspace_assets.execute

# Clean uninstall
bench --site <s> uninstall-app ding                  # removes custom fields + empty roles + snapshot
```

---

## Known limitations / future work

- **No Italian/Hindi/etc localizations** — labels are English only. Use Frappe's translation system if you need multilingual.
- **Geocoding is opt-in** — defaults to off. Enable in Field Sales Settings if you want address → lat/lng on customer record edits.
- **PWA offline support is "best effort"** — actions are queued in `localStorage`, not IndexedDB, so very large queues may be capped by the browser. For full offline-first, replace the queue with IDB.
- **Conversion Funnel report** assumes ERPNext's standard Lead → Customer linkage (`tabCustomer.lead_name`); custom CRM apps may need to subclass the report.
- **Service auto-Stock-Entry** posts a draft Material Issue; warehouse must submit it manually. Configurable via `Field Sales Settings.auto_create_stock_entry_for_service_parts`.
