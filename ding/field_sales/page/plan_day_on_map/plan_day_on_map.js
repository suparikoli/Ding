frappe.pages['plan-day-on-map'].on_page_load = function (wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Plan a Day on Map'),
        single_column: true
    });

    addStyles();

    const $body = $(`
        <div class="ding-pdm">
            <div class="ding-pdm-toolbar">
                <div class="ding-pdm-fields"></div>
                <div class="ding-pdm-summary text-muted small"></div>
                <div class="ding-pdm-actions">
                    <button class="btn btn-default btn-sm ding-pdm-optimize">${__('Optimize Sequence')}</button>
                    <button class="btn btn-default btn-sm ding-pdm-clear">${__('Clear')}</button>
                    <button class="btn btn-default btn-sm ding-pdm-draft">${__('Save as Draft')}</button>
                    <button class="btn btn-primary btn-sm ding-pdm-release">${__('Save & Release')}</button>
                </div>
            </div>
            <div class="ding-pdm-grid">
                <div class="ding-pdm-side">
                    <div class="ding-pdm-search">
                        <input type="text" class="form-control input-sm ding-pdm-search-input" placeholder="${__('Search clients…')}" />
                        <div class="ding-pdm-filters">
                            <label><input type="checkbox" class="ding-pdm-type" data-type="Lead" checked /> ${__('Leads')}</label>
                            <label><input type="checkbox" class="ding-pdm-type" data-type="Customer" checked /> ${__('Customers')}</label>
                            <label><input type="checkbox" class="ding-pdm-type" data-type="Contact" checked /> ${__('Contacts')}</label>
                        </div>
                    </div>
                    <h6 class="ding-pdm-side-h">${__("Today's Stops")}</h6>
                    <div class="ding-pdm-stops"></div>
                    <div class="ding-pdm-empty text-muted small">${__('Click markers on the map to add stops to the plan.')}</div>
                </div>
                <div class="ding-pdm-map" id="ding-pdm-map"></div>
            </div>
        </div>
    `).appendTo(page.body);

    const state = {
        agent: frappe.session.user,
        plan_date: frappe.datetime.get_today(),
        territory: '',
        stops: [],          // [{client_doctype, client_name, label, lat, lng, visit_type, objective, planned_duration}]
        clients: [],        // all loaded clients
        markers: {},        // key = `${type}:${name}` → marker handle
        mapHandle: null,
    };

    /* Toolbar fields */
    const $fields = $body.find('.ding-pdm-fields');
    const agent = frappe.ui.form.make_control({
        df: { fieldtype: 'Link', options: 'User', fieldname: 'agent', label: __('Agent'), reqd: 1 },
        parent: $fields[0], render_input: true,
    });
    agent.set_value(state.agent);
    agent.df.onchange = () => { state.agent = agent.get_value(); refreshExisting(); };
    const dateCtl = frappe.ui.form.make_control({
        df: { fieldtype: 'Date', fieldname: 'plan_date', label: __('Date'), reqd: 1 },
        parent: $fields[0], render_input: true,
    });
    dateCtl.set_value(state.plan_date);
    dateCtl.df.onchange = () => { state.plan_date = dateCtl.get_value(); refreshExisting(); };
    const terrCtl = frappe.ui.form.make_control({
        df: { fieldtype: 'Link', options: 'Territory', fieldname: 'territory', label: __('Territory') },
        parent: $fields[0], render_input: true,
    });
    terrCtl.df.onchange = () => { state.territory = terrCtl.get_value(); reloadClients(); };

    /* Map + clients */
    if (!window.dingMaps) {
        $body.find('.ding-pdm-empty').text(__('Maps helper not loaded — try clear-cache + reload.'));
        return;
    }
    window.dingMaps.createMap(document.getElementById('ding-pdm-map'), { zoom: 5 })
        .then((handle) => { state.mapHandle = handle; reloadClients(); refreshExisting(); });

    function reloadClients() {
        const include = $body.find('.ding-pdm-type:checked').map((_, el) => $(el).data('type')).get().join(',');
        if (!include) return;
        frappe.xcall('ding.field_sales.api.list_geolocated_clients', {
            include, territory: state.territory || null,
            search: ($body.find('.ding-pdm-search-input').val() || '').trim() || null,
        }).then((rows) => {
            state.clients = rows;
            renderClientMarkers();
        });
    }

    function renderClientMarkers() {
        if (!state.mapHandle) return;
        const colors = { Lead: '#f59e0b', Customer: '#3b82f6', Contact: '#10b981' };
        const stopKeys = new Set(state.stops.map((s) => `${s.client_doctype}:${s.client_name}`));
        const markerStops = state.clients.map((c) => {
            const coord = window.dingMaps.extractLatLng(c.geolocation);
            if (!coord) return null;
            const key = `${c.type}:${c.name}`;
            const seqNum = state.stops.findIndex((s) => `${s.client_doctype}:${s.client_name}` === key) + 1;
            return {
                lat: coord.lat, lng: coord.lng,
                label: seqNum > 0 ? String(seqNum) : c.type[0],
                title: `${c.label} (${c.type})`,
                popup: `<strong>${frappe.utils.escape_html(c.label)}</strong><br/>` +
                       `<span style="color:#666">${c.type}${c.territory ? ' · ' + c.territory : ''}</span><br/>` +
                       `<a href="#" class="ding-pdm-add" data-type="${c.type}" data-name="${frappe.utils.escape_html(c.name)}">` +
                       (stopKeys.has(key) ? __('✓ Added — click to remove') : __('+ Add to plan')) + `</a>`,
                _clientKey: key, _clientType: c.type,
            };
        }).filter(Boolean);
        state.mapHandle.addStopMarkers(markerStops);
        // Wire popup click handlers (delegated to body since popups detach + re-attach).
        $(document).off('click.dingPdm').on('click.dingPdm', '.ding-pdm-add', function (e) {
            e.preventDefault();
            toggleStop($(this).data('type'), $(this).data('name'));
        });
        drawRoute();
    }

    function toggleStop(clientDoctype, clientName) {
        const key = `${clientDoctype}:${clientName}`;
        const idx = state.stops.findIndex((s) => `${s.client_doctype}:${s.client_name}` === key);
        if (idx >= 0) {
            state.stops.splice(idx, 1);
        } else {
            const c = state.clients.find((x) => x.type === clientDoctype && x.name === clientName);
            if (!c) return;
            const coord = window.dingMaps.extractLatLng(c.geolocation);
            state.stops.push({
                client_doctype: c.type, client_name: c.name, label: c.label,
                lat: coord.lat, lng: coord.lng,
                visit_type: 'Sales', objective: '', planned_duration: 1800,
            });
        }
        renderClientMarkers();
        renderSidebar();
    }

    function renderSidebar() {
        const $list = $body.find('.ding-pdm-stops');
        const $empty = $body.find('.ding-pdm-empty');
        $list.empty();
        if (!state.stops.length) {
            $empty.show();
            $body.find('.ding-pdm-summary').text('');
            return;
        }
        $empty.hide();
        state.stops.forEach((s, i) => {
            const $row = $(`
                <div class="ding-pdm-stop">
                    <div class="ding-pdm-stop-head">
                        <span class="ding-pdm-seq">${i + 1}</span>
                        <span class="ding-pdm-stop-name">${frappe.utils.escape_html(s.label)}</span>
                        <span class="ding-pdm-stop-type text-muted small">${s.client_doctype}</span>
                        <button class="btn btn-xs btn-link ding-pdm-up"   ${i === 0 ? 'disabled' : ''}>↑</button>
                        <button class="btn btn-xs btn-link ding-pdm-down" ${i === state.stops.length - 1 ? 'disabled' : ''}>↓</button>
                        <button class="btn btn-xs btn-link ding-pdm-rm">✕</button>
                    </div>
                    <div class="ding-pdm-stop-body">
                        <select class="form-control input-xs ding-pdm-vt">
                            <option ${s.visit_type === 'Sales' ? 'selected' : ''}>Sales</option>
                            <option ${s.visit_type === 'Demo' ? 'selected' : ''}>Demo</option>
                            <option ${s.visit_type === 'Service' ? 'selected' : ''}>Service</option>
                            <option ${s.visit_type === 'Delivery' ? 'selected' : ''}>Delivery</option>
                            <option ${s.visit_type === 'Collection' ? 'selected' : ''}>Collection</option>
                            <option ${s.visit_type === 'Survey' ? 'selected' : ''}>Survey</option>
                            <option ${s.visit_type === 'Other' ? 'selected' : ''}>Other</option>
                        </select>
                        <input type="text" class="form-control input-xs ding-pdm-obj" placeholder="${__('Objective…')}" value="${frappe.utils.escape_html(s.objective || '')}" />
                    </div>
                </div>
            `);
            $row.find('.ding-pdm-rm').on('click', () => { state.stops.splice(i, 1); renderClientMarkers(); renderSidebar(); });
            $row.find('.ding-pdm-up').on('click', () => { if (i > 0) { swap(state.stops, i, i - 1); renderClientMarkers(); renderSidebar(); } });
            $row.find('.ding-pdm-down').on('click', () => { if (i < state.stops.length - 1) { swap(state.stops, i, i + 1); renderClientMarkers(); renderSidebar(); } });
            $row.find('.ding-pdm-vt').on('change', function () { s.visit_type = this.value; });
            $row.find('.ding-pdm-obj').on('input', function () { s.objective = this.value; });
            $list.append($row);
        });

        const km = approxDistanceKm(state.stops);
        $body.find('.ding-pdm-summary').text(__('{0} stops · ~{1} km', [state.stops.length, km.toFixed(1)]));
    }

    function approxDistanceKm(stops) {
        const R = 6371;
        let d = 0;
        for (let i = 1; i < stops.length; i++) {
            const a = stops[i - 1], b = stops[i];
            const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
            const dLat = (b.lat - a.lat) * Math.PI / 180;
            const dLon = (b.lng - a.lng) * Math.PI / 180;
            const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
            d += 2 * R * Math.asin(Math.sqrt(h));
        }
        return d;
    }

    function swap(arr, i, j) { const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

    function drawRoute() {
        if (!state.mapHandle) return;
        state.mapHandle.drawRoute(state.stops.map((s) => ({ lat: s.lat, lng: s.lng })));
    }

    function refreshExisting() {
        // If a Day Plan already exists for (agent, date), prefill its stops.
        if (!state.agent || !state.plan_date) return;
        frappe.db.get_value('Day Plan', { assigned_to: state.agent, plan_date: state.plan_date }, 'name')
            .then((r) => {
                const planName = r.message && r.message.name;
                if (!planName) {
                    state.stops = [];
                    renderClientMarkers();
                    renderSidebar();
                    return;
                }
                frappe.db.get_doc('Day Plan', planName).then((plan) => {
                    state.stops = (plan.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
                        .map((s) => {
                            const c = window.dingMaps.extractLatLng(s.client_geolocation);
                            return c ? {
                                client_doctype: s.client_doctype, client_name: s.client_name,
                                label: s.client_name, lat: c.lat, lng: c.lng,
                                visit_type: s.visit_type || 'Sales', objective: s.objective || '',
                                planned_duration: s.planned_duration || 1800,
                            } : null;
                        }).filter(Boolean);
                    renderClientMarkers();
                    renderSidebar();
                });
            });
    }

    /* Save handlers */
    function save(release) {
        if (!state.stops.length) {
            frappe.msgprint(__('Add at least one stop.'));
            return;
        }
        frappe.call({
            method: 'ding.field_sales.api.plan_day_for_agent',
            args: {
                agent: state.agent, plan_date: state.plan_date,
                territory: state.territory || null, release: release ? 1 : 0,
                stops: JSON.stringify(state.stops.map((s, i) => ({
                    sequence: i + 1, client_doctype: s.client_doctype, client_name: s.client_name,
                    visit_type: s.visit_type, objective: s.objective, planned_duration: s.planned_duration,
                }))),
            },
            freeze: true,
            freeze_message: release ? __('Releasing plan…') : __('Saving draft…'),
            callback: (r) => {
                if (r.message) {
                    frappe.show_alert({
                        message: __('Saved {0} ({1} stops, ~{2} km)', [
                            r.message.plan_name, r.message.stop_count,
                            ((r.message.planned_distance_m || 0) / 1000).toFixed(1)
                        ]),
                        indicator: 'green'
                    });
                    if (release) frappe.set_route('Form', 'Day Plan', r.message.plan_name);
                }
            }
        });
    }

    /* Wire toolbar */
    $body.find('.ding-pdm-release').on('click', () => save(true));
    $body.find('.ding-pdm-draft').on('click', () => save(false));
    $body.find('.ding-pdm-clear').on('click', () => {
        frappe.confirm(__('Clear the plan?'), () => { state.stops = []; renderClientMarkers(); renderSidebar(); });
    });
    $body.find('.ding-pdm-optimize').on('click', () => {
        if (state.stops.length < 3) { frappe.msgprint(__('Add at least 3 stops to optimize.')); return; }
        const sorted = nearestNeighbor(state.stops.slice());
        twoOptInPlace(sorted);
        state.stops = sorted;
        renderClientMarkers();
        renderSidebar();
        frappe.show_alert({ message: __('Sequence optimized'), indicator: 'green' });
    });
    $body.find('.ding-pdm-search-input').on('input', frappe.utils.debounce(reloadClients, 300));
    $body.find('.ding-pdm-type').on('change', reloadClients);

    /* Local optimizer (NN seed + 2-opt swap) */
    function nearestNeighbor(stops) {
        if (stops.length < 2) return stops;
        const out = [stops.shift()];
        while (stops.length) {
            const last = out[out.length - 1];
            let bestIdx = 0, bestD = Infinity;
            stops.forEach((s, i) => {
                const d = haver(last, s);
                if (d < bestD) { bestD = d; bestIdx = i; }
            });
            out.push(stops.splice(bestIdx, 1)[0]);
        }
        return out;
    }
    function twoOptInPlace(arr) {
        let improved = true, iter = 0;
        const total = (a) => a.slice(1).reduce((acc, s, i) => acc + haver(a[i], s), 0);
        while (improved && iter < 200) {
            improved = false; iter += 1;
            for (let i = 1; i < arr.length - 2; i++) {
                for (let j = i + 1; j < arr.length; j++) {
                    if (j - i === 1) continue;
                    const newA = arr.slice(0, i).concat(arr.slice(i, j).reverse(), arr.slice(j));
                    if (total(newA) < total(arr)) {
                        arr.splice(0, arr.length, ...newA);
                        improved = true;
                    }
                }
            }
        }
    }
    function haver(a, b) {
        const R = 6371000, lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
        const dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lng - a.lng) * Math.PI / 180;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    function addStyles() {
        if (document.getElementById('ding-pdm-styles')) return;
        const css = `
            .ding-pdm { padding: 0; }
            .ding-pdm-toolbar { display:flex; gap:14px; align-items:center; padding:10px 14px; border-bottom:1px solid var(--border-color); flex-wrap: wrap; }
            .ding-pdm-fields { display:flex; gap:10px; align-items:center; }
            .ding-pdm-fields .frappe-control { width: 180px; margin-bottom: 0; }
            .ding-pdm-fields .control-label { font-size: 11px; margin-bottom: 2px; color: var(--text-muted); }
            .ding-pdm-summary { margin-left: auto; }
            .ding-pdm-actions { display:flex; gap:6px; }
            .ding-pdm-grid { display:grid; grid-template-columns: 320px 1fr; gap:0; height: calc(100vh - 130px); }
            .ding-pdm-side { background: var(--card-bg); border-right:1px solid var(--border-color); padding: 10px 12px; overflow-y: auto; }
            .ding-pdm-side-h { margin: 12px 0 6px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
            .ding-pdm-search-input { margin-bottom: 6px; }
            .ding-pdm-filters { display:flex; gap:10px; font-size: 12px; margin-bottom: 8px; }
            .ding-pdm-filters label { font-weight: normal; color: var(--text-muted); margin: 0; }
            .ding-pdm-empty { padding: 20px 0; text-align: center; }
            .ding-pdm-stop { background: var(--bg-light-gray); border-radius: 6px; padding: 8px 10px; margin-bottom: 6px; }
            .ding-pdm-stop-head { display:flex; align-items:center; gap:8px; }
            .ding-pdm-seq { display:inline-block; min-width:22px; height:22px; line-height:22px; text-align:center;
                            background: var(--blue); color: white; border-radius: 50%; font-size: 11px; font-weight:600; }
            .ding-pdm-stop-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .ding-pdm-stop-body { display:flex; gap:6px; margin-top:6px; }
            .ding-pdm-stop-body .form-control { font-size: 11px; padding: 2px 6px; height: 24px; }
            .ding-pdm-vt { width: 90px; flex: 0 0 auto; }
            .ding-pdm-obj { flex: 1; }
            .ding-pdm-map { height: 100%; }
            @media (max-width: 768px) {
                .ding-pdm-grid { grid-template-columns: 1fr; }
                .ding-pdm-side { max-height: 38vh; }
            }
        `;
        const tag = document.createElement('style');
        tag.id = 'ding-pdm-styles';
        tag.appendChild(document.createTextNode(css));
        document.head.appendChild(tag);
    }
};
