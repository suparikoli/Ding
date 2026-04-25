/* Ding Field PWA — vanilla JS, no framework dependency.
 * Two views (agent / manager) chosen by URL hash.
 * Calls the same /api/method/ding.field_sales.api.* endpoints as the desk.
 */

(function () {
    'use strict';

    const API = '/api/method/';
    const QUEUE_KEY = 'ding.field.pending';

    const state = {
        plan: null,
        positions: [],
        plans: [],
        heartbeatTimer: null,
    };

    function isManager() {
        const roles = window.DING_ROLES || [];
        return roles.includes('Field Operations Manager') ||
               roles.includes('System Manager') ||
               roles.includes('Administrator');
    }

    document.getElementById('user-name').textContent = window.DING_USER || '';
    if (!isManager()) {
        document.querySelectorAll('.manager-only').forEach((el) => el.classList.add('hidden'));
    }

    /* -------------------------------------------------------------------- */
    /* Routing */
    /* -------------------------------------------------------------------- */

    function go() {
        const hash = (window.location.hash || '#/agent').replace(/^#/, '');
        const view = hash.startsWith('/manager') ? 'manager' : 'agent';
        showView(view);
    }

    function showView(name) {
        document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
        document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        const tab = document.querySelector(`.tab[data-tab="${name}"]`);
        if (tab) tab.classList.add('active');

        if (name === 'manager' && isManager()) {
            document.getElementById('view-manager').classList.remove('hidden');
            renderManager();
        } else {
            document.getElementById('view-agent').classList.remove('hidden');
            renderAgent();
        }
    }

    window.addEventListener('hashchange', go);

    /* -------------------------------------------------------------------- */
    /* API helpers — call Frappe REST */
    /* -------------------------------------------------------------------- */

    function callApi(method, args, options) {
        const opts = options || {};
        const url = API + method;
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Frappe-CSRF-Token': window.DING_CSRF || 'no-csrf',
            'Accept': 'application/json',
        };
        const body = encodeForm(args || {});
        return fetch(url, { method: 'POST', headers: headers, body: body, credentials: 'include' })
            .then((res) => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then((d) => d.message)
            .catch((err) => {
                if (opts.queue) {
                    queuePending({ method: method, args: args || {} });
                    toast('Saved offline — will sync when online');
                    return null;
                }
                throw err;
            });
    }

    function encodeForm(args) {
        return Object.keys(args)
            .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(args[k] == null ? '' : args[k]))
            .join('&');
    }

    /* -------------------------------------------------------------------- */
    /* Offline queue */
    /* -------------------------------------------------------------------- */

    function queuePending(item) {
        try {
            const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
            list.push(item);
            localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
        } catch (e) { /* ignore */ }
    }

    function flushPending() {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return; }
        if (!list.length) return;
        const remaining = [];
        const work = list.map((item) =>
            callApi(item.method, item.args).catch(() => remaining.push(item))
        );
        Promise.all(work).then(() => {
            localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
            if (list.length !== remaining.length) {
                toast(`Synced ${list.length - remaining.length} pending action(s)`);
                go();
            }
        });
    }

    window.addEventListener('online', flushPending);
    flushPending();

    /* -------------------------------------------------------------------- */
    /* Agent view */
    /* -------------------------------------------------------------------- */

    function renderAgent() {
        const $v = document.getElementById('view-agent');
        $v.innerHTML = `
            <div class="summary" id="agent-summary">
                <div class="stat"><div class="num" id="s-done">–</div><div class="lbl">Done</div></div>
                <div class="stat"><div class="num" id="s-rem">–</div><div class="lbl">Remaining</div></div>
                <div class="stat"><div class="num" id="s-adh">–</div><div class="lbl">Adherence</div></div>
            </div>
            <button class="btn primary big-cta hidden" id="agent-cta"></button>
            <div id="agent-map" class="agent-map hidden"></div>
            <div id="stops"></div>
            <div id="empty" class="empty hidden">
                <p>No plan for today.</p>
                <a class="btn primary" href="/app/day-plan/new?assigned_to=${encodeURIComponent(window.DING_USER || '')}&plan_date=${todayISO()}">Create plan</a>
            </div>
        `;
        loadAgent();
        startHeartbeat();
    }

    function loadAgent() {
        callApi('ding.field_sales.api.get_today_plan', {}).then((res) => {
            state.plan = res && res.plan;
            renderAgentList();
        }).catch(() => toast('Failed to load plan'));
    }

    function renderAgentList() {
        const $stops = document.getElementById('stops');
        const $empty = document.getElementById('empty');
        const $cta = document.getElementById('agent-cta');
        const $map = document.getElementById('agent-map');
        if (!state.plan) {
            $stops.innerHTML = '';
            $empty.classList.remove('hidden');
            $cta.classList.add('hidden');
            $map.classList.add('hidden');
            document.getElementById('s-done').textContent = '–';
            document.getElementById('s-rem').textContent = '–';
            document.getElementById('s-adh').textContent = '–';
            return;
        }
        $empty.classList.add('hidden');
        const plan = state.plan;
        document.getElementById('s-done').textContent = plan.summary_completed_count || 0;
        document.getElementById('s-rem').textContent =
            (plan.summary_planned_count || 0) - (plan.summary_completed_count || 0);
        document.getElementById('s-adh').textContent = (plan.adherence_pct || 0).toFixed(0) + '%';

        const stops = (plan.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        $stops.innerHTML = stops.map(stopCardHtml).join('');
        stops.forEach((stop) => bindStop(stop));

        // Big primary CTA — start next, end current, or close out the day.
        const inProgress = stops.find((s) => s.status === 'In Progress');
        const nextPending = stops.find((s) => s.status === 'Pending');
        if (inProgress) {
            $cta.classList.remove('hidden');
            $cta.textContent = `✋ End: ${inProgress.client_name}`;
            $cta.onclick = () => doAction(inProgress, 'end');
        } else if (nextPending) {
            $cta.classList.remove('hidden');
            $cta.textContent = `▶ Start: ${nextPending.client_name}`;
            $cta.onclick = () => doAction(nextPending, 'start');
        } else {
            $cta.classList.add('hidden');
        }

        // Map preview with sequenced stops + route polyline.
        $map.classList.remove('hidden');
        renderAgentMap(stops);
    }

    function renderAgentMap(stops) {
        const points = stops
            .map((s, i) => {
                const c = extractLatLng(s.client_geolocation);
                if (!c) return null;
                return {
                    lat: c.lat, lng: c.lng,
                    label: String(s.sequence || i + 1),
                    title: s.client_name,
                    status: s.status,
                };
            })
            .filter(Boolean);
        if (!points.length) return;

        const ready = agentMapInstance
            ? Promise.resolve(agentMapInstance)
            : createMap('agent-map', [points[0].lat, points[0].lng], 13)
                .then((m) => { agentMapInstance = m; return m; });

        ready.then((map) => {
            // clear previous markers/polyline
            if (mapApi === 'google') {
                agentMapMarkers.forEach((m) => m.setMap(null));
                if (agentMapPolyline) agentMapPolyline.setMap(null);
            } else {
                agentMapMarkers.forEach((m) => map.removeLayer(m));
                if (agentMapPolyline) map.removeLayer(agentMapPolyline);
            }
            agentMapMarkers = [];
            agentMapPolyline = null;

            const coords = [];
            points.forEach((p) => {
                const popup = `<strong>#${p.label}</strong> · ${escape(p.title)}<br/>${escape(p.status || '')}`;
                if (mapApi === 'google') {
                    const marker = new google.maps.Marker({
                        position: { lat: p.lat, lng: p.lng }, map,
                        label: { text: p.label, color: 'white', fontWeight: 'bold' },
                        title: p.title,
                    });
                    const info = new google.maps.InfoWindow({ content: popup });
                    marker.addListener('click', () => info.open({ map, anchor: marker }));
                    agentMapMarkers.push(marker);
                } else {
                    const marker = L.marker([p.lat, p.lng]).addTo(map).bindPopup(popup);
                    agentMapMarkers.push(marker);
                }
                coords.push([p.lat, p.lng]);
            });

            if (coords.length >= 2) {
                if (mapApi === 'google') {
                    agentMapPolyline = new google.maps.Polyline({
                        path: coords.map((c) => ({ lat: c[0], lng: c[1] })),
                        map, geodesic: true,
                        strokeColor: '#3b82f6', strokeOpacity: 0.85, strokeWeight: 3,
                    });
                } else {
                    agentMapPolyline = L.polyline(coords, {
                        color: '#3b82f6', weight: 3, opacity: 0.85
                    }).addTo(map);
                }
            }

            if (mapApi === 'google') {
                const bounds = new google.maps.LatLngBounds();
                coords.forEach((c) => bounds.extend({ lat: c[0], lng: c[1] }));
                map.fitBounds(bounds, 50);
            } else {
                map.fitBounds(coords, { padding: [30, 30], maxZoom: 14 });
            }
        });
    }

    function stopCardHtml(stop) {
        const obj = stop.objective ? ' · ' + escape(stop.objective) : '';
        const time = stop.planned_start_time ? ' · ' + stop.planned_start_time : '';
        return `
            <div class="stop-card" data-status="${stop.status}" data-row="${stop.name}">
                <div class="row">
                    <div>
                        <div class="name">#${stop.sequence || ''} · ${escape(stop.client_name)}</div>
                        <div class="meta">${stop.visit_type || ''}${time}${obj}</div>
                    </div>
                    <span class="status-pill">${stop.status}</span>
                </div>
                <div class="actions" data-actions></div>
            </div>
        `;
    }

    function bindStop(stop) {
        const $card = document.querySelector(`.stop-card[data-row="${stop.name}"]`);
        const $actions = $card.querySelector('[data-actions]');
        const buttons = [];
        if (stop.status === 'Pending') {
            buttons.push(btn('primary', 'Start', () => doAction(stop, 'start')));
            buttons.push(btn('', 'Skip', () => promptSkip(stop)));
        } else if (stop.status === 'In Progress') {
            buttons.push(btn('primary', 'End', () => doAction(stop, 'end')));
        }
        if (stop.client_geolocation) {
            buttons.push(btn('', 'Navigate', () => navigate(stop)));
        }
        buttons.forEach((b) => $actions.appendChild(b));
    }

    function btn(cls, label, onClick) {
        const b = document.createElement('button');
        b.className = 'btn ' + cls;
        b.textContent = label;
        b.addEventListener('click', onClick);
        return b;
    }

    function doAction(stop, action, payload) {
        callApi('ding.field_sales.api.stop_action', {
            plan_name: state.plan.name,
            stop_row: stop.name,
            action: action,
            payload: payload || '',
        }, { queue: true }).then(loadAgent).catch(() => toast('Failed'));
    }

    function promptSkip(stop) {
        const reason = window.prompt('Skip reason?');
        if (reason) doAction(stop, 'skip', reason);
    }

    function navigate(stop) {
        const c = extractLatLng(stop.client_geolocation);
        if (!c) return toast('No location for this stop');
        window.open('https://www.google.com/maps?q=' + c.lat + ',' + c.lng, '_blank');
    }

    function startHeartbeat() {
        if (state.heartbeatTimer) return;
        const ping = function () {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
                callApi('ding.field_sales.api.heartbeat', {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy_m: pos.coords.accuracy,
                }, { queue: true });
            }, () => {});
        };
        ping();
        state.heartbeatTimer = setInterval(ping, 5 * 60 * 1000);
    }

    /* -------------------------------------------------------------------- */
    /* Manager view */
    /* -------------------------------------------------------------------- */

    let mapApi = null;          // 'google' or 'leaflet'
    let mapInstance = null;
    let mapMarkers = [];
    let agentMapInstance = null;
    let agentMapMarkers = [];
    let agentMapPolyline = null;
    let mapLoaderPromise = null;

    function loadMapsSdk() {
        if (mapLoaderPromise) return mapLoaderPromise;
        const provider = window.DING_MAPS_PROVIDER || 'OpenStreetMap';
        const apiKey = window.DING_MAPS_KEY || '';
        if (provider === 'Google' && apiKey) {
            mapLoaderPromise = new Promise((resolve, reject) => {
                if (window.google && window.google.maps) { resolve('google'); return; }
                const cb = `__dingPwaGmapsCb_${Date.now()}`;
                window[cb] = () => { resolve('google'); delete window[cb]; };
                const s = document.createElement('script');
                s.async = true;
                s.src = 'https://maps.googleapis.com/maps/api/js?'
                    + 'key=' + encodeURIComponent(apiKey)
                    + '&libraries=marker&loading=async&callback=' + cb;
                s.onerror = () => reject(new Error('Google SDK load failed'));
                document.head.appendChild(s);
            }).catch(() => loadLeaflet());
        } else {
            mapLoaderPromise = loadLeaflet();
        }
        return mapLoaderPromise;
    }

    function loadLeaflet() {
        return new Promise((resolve, reject) => {
            if (window.L) { resolve('leaflet'); return; }
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            s.onload = () => resolve('leaflet');
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function createMap(elementId, center, zoom) {
        const el = document.getElementById(elementId);
        return loadMapsSdk().then((sdk) => {
            mapApi = sdk;
            if (sdk === 'google') {
                return new google.maps.Map(el, {
                    center: { lat: center[0], lng: center[1] },
                    zoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
                });
            }
            const m = L.map(el).setView(center, zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19, attribution: '© OpenStreetMap'
            }).addTo(m);
            return m;
        });
    }

    function renderManager() {
        const $v = document.getElementById('view-manager');
        $v.innerHTML = `
            <div class="map-wrap">
                <div id="manager-map-el"></div>
                <div class="team-list" id="team-list"></div>
            </div>
        `;
        const ready = mapInstance
            ? Promise.resolve(mapInstance)
            : createMap('manager-map-el', [12.97, 77.59], 4).then((m) => { mapInstance = m; return m; });
        ready.then(() => {
            loadManager();
            if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = setInterval(loadManager, 60 * 1000);
        });
    }

    function loadManager() {
        Promise.all([
            callApi('ding.field_sales.api.team_live_positions', { within_minutes: 30 }),
            callApi('ding.field_sales.api.team_today_plans', {}),
        ]).then(([positions, plans]) => {
            state.positions = positions || [];
            state.plans = plans || [];
            renderTeamMarkers();
            renderTeamList();
        }).catch(() => toast('Failed to load team data'));
    }

    function renderTeamMarkers() {
        if (!mapInstance) return;
        // Clear previous markers
        if (mapApi === 'google') {
            mapMarkers.forEach((m) => m.setMap(null));
        } else {
            mapMarkers.forEach((m) => mapInstance.removeLayer(m));
        }
        mapMarkers = [];
        const coords = [];
        state.positions.forEach((pos) => {
            const c = extractLatLng(pos.geolocation);
            if (!c) return;
            const ageMin = Math.round((Date.now() - new Date(pos.timestamp).getTime()) / 60000);
            const popup = `<strong>${escape(pos.rep)}</strong><br/>${ageMin} min ago` +
                (pos.inside_geofence_name ? `<br/>📍 ${escape(pos.inside_geofence_name)}` : '');
            if (mapApi === 'google') {
                const marker = new google.maps.Marker({
                    position: { lat: c.lat, lng: c.lng }, map: mapInstance,
                    title: pos.rep, label: { text: (pos.rep || '?').slice(0, 1).toUpperCase(), color: 'white' }
                });
                const info = new google.maps.InfoWindow({ content: popup });
                marker.addListener('click', () => info.open({ map: mapInstance, anchor: marker }));
                mapMarkers.push(marker);
            } else {
                const marker = L.marker([c.lat, c.lng]).addTo(mapInstance).bindPopup(popup);
                mapMarkers.push(marker);
            }
            coords.push([c.lat, c.lng]);
        });
        if (coords.length) {
            if (mapApi === 'google') {
                const bounds = new google.maps.LatLngBounds();
                coords.forEach((c) => bounds.extend({ lat: c[0], lng: c[1] }));
                mapInstance.fitBounds(bounds, 60);
            } else {
                mapInstance.fitBounds(coords, { padding: [40, 40], maxZoom: 13 });
            }
        }
    }

    function renderTeamList() {
        const $list = document.getElementById('team-list');
        const posByUser = {};
        state.positions.forEach((p) => { posByUser[p.rep] = p; });
        if (!state.plans.length) {
            $list.innerHTML = '<p class="empty">No plans for today.</p>';
            return;
        }
        $list.innerHTML = state.plans.map((plan) => {
            const live = posByUser[plan.assigned_to];
            const stale = !live;
            return `
                <div class="team-card" data-plan="${plan.name}">
                    <div class="team-name">
                        <span class="live-dot ${stale ? 'stale' : ''}"></span>
                        ${escape(plan.assigned_to)}
                    </div>
                    <div class="team-stats">
                        ${plan.summary_completed_count || 0}/${plan.summary_planned_count || 0} done ·
                        ${(plan.adherence_pct || 0).toFixed(0)}% · ${plan.status}
                    </div>
                </div>
            `;
        }).join('');
        document.querySelectorAll('.team-card').forEach((el) => {
            el.addEventListener('click', () => {
                window.open('/app/day-plan/' + encodeURIComponent(el.dataset.plan), '_blank');
            });
        });
    }

    /* -------------------------------------------------------------------- */
    /* Utilities */
    /* -------------------------------------------------------------------- */

    function extractLatLng(geoValue) {
        if (!geoValue) return null;
        try {
            const obj = typeof geoValue === 'string' ? JSON.parse(geoValue) : geoValue;
            const feats = obj.features || (obj.type === 'Feature' ? [obj] : []);
            for (const feat of feats) {
                const geom = feat.geometry || (feat.type === 'Point' ? feat : null);
                if (geom && geom.type === 'Point' && geom.coordinates && geom.coordinates.length >= 2) {
                    return { lat: Number(geom.coordinates[1]), lng: Number(geom.coordinates[0]) };
                }
            }
        } catch (e) { /* fall through */ }
        return null;
    }

    function escape(s) {
        const div = document.createElement('div');
        div.textContent = s == null ? '' : String(s);
        return div.innerHTML;
    }

    function toast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    function todayISO() {
        const d = new Date();
        return d.toISOString().slice(0, 10);
    }

    /* -------------------------------------------------------------------- */
    /* Boot */
    /* -------------------------------------------------------------------- */
    go();
})();
