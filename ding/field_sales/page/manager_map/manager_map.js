frappe.pages['manager-map'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Manager Map'),
        single_column: true
    });

    addStyles();

    const $body = $(`
        <div class="ding-mm">
            <div class="ding-mm-controls">
                <label>${__('Heartbeat window (min)')}: <input type="number" class="form-control input-sm ding-mm-window" value="30" style="width: 90px; display:inline-block;" /></label>
                <button class="btn btn-default btn-sm ding-mm-refresh">${__('Refresh')}</button>
                <span class="ding-mm-meta"></span>
                <span class="ding-mm-provider text-muted small"></span>
            </div>
            <div class="ding-mm-grid">
                <div class="ding-mm-map" id="ding-mm-map"></div>
                <div class="ding-mm-side">
                    <h5>${__("Today's Plans")}</h5>
                    <div class="ding-mm-plans"></div>
                </div>
            </div>
        </div>
    `).appendTo(page.body);

    let mapHandle = null;
    let pollTimer = null;

    function addStyles() {
        if (document.getElementById('ding-mm-styles')) return;
        const css = `
            .ding-mm-controls { display:flex; gap:12px; align-items:center; padding:12px; flex-wrap: wrap; }
            .ding-mm-meta { color: var(--text-muted); font-size: 12px; margin-left: auto; }
            .ding-mm-provider::before { content: '· '; }
            .ding-mm-grid { display:grid; grid-template-columns: 1fr 320px; gap:12px; padding:0 12px 12px; }
            .ding-mm-map { height: calc(100vh - 200px); border:1px solid var(--border-color); border-radius:6px; }
            .ding-mm-side { background: var(--card-bg); border:1px solid var(--border-color); border-radius:6px; padding:12px; height: calc(100vh - 200px); overflow-y:auto; }
            .ding-mm-plan-card { padding:10px; border-bottom:1px solid var(--border-color); cursor:pointer; }
            .ding-mm-plan-card:hover { background: var(--bg-light-gray); }
            .ding-mm-plan-card[data-active="1"] { background: var(--bg-blue); }
            .ding-mm-plan-name { font-weight:600; }
            .ding-mm-plan-stats { font-size:12px; color: var(--text-muted); margin-top:4px; }
            @media (max-width: 768px) {
              .ding-mm-grid { grid-template-columns: 1fr; }
              .ding-mm-map, .ding-mm-side { height: 50vh; }
            }
        `;
        const tag = document.createElement('style');
        tag.id = 'ding-mm-styles';
        tag.appendChild(document.createTextNode(css));
        document.head.appendChild(tag);
    }

    if (!window.dingMaps) {
        $body.find('.ding-mm-meta').text(__('Maps helper not loaded — try clear-cache + reload.'));
        return;
    }

    window.dingMaps.createMap(document.getElementById('ding-mm-map'), { zoom: 4 })
        .then((handle) => {
            mapHandle = handle;
            $body.find('.ding-mm-provider').text(
                handle.provider === 'google' ? __('Google Maps') : __('OpenStreetMap')
            );
            return refresh();
        })
        .then(startPolling);

    function refresh() {
        const window_min = parseInt($body.find('.ding-mm-window').val() || '30', 10);
        return Promise.all([
            frappe.xcall('ding.field_sales.api.team_live_positions', { within_minutes: window_min }),
            frappe.xcall('ding.field_sales.api.team_today_plans')
        ]).then(([positions, plans]) => {
            renderMarkers(positions);
            renderPlans(plans, positions);
            $body.find('.ding-mm-meta').text(__('{0} agents · {1} plans', [positions.length, plans.length]));
        });
    }

    function renderMarkers(positions) {
        if (!mapHandle) return;
        const stops = [];
        positions.forEach((pos) => {
            const c = window.dingMaps.extractLatLng(pos.geolocation);
            if (!c) return;
            const ageMin = Math.round((Date.now() - new Date(pos.timestamp).getTime()) / 60000);
            stops.push({
                lat: c.lat, lng: c.lng,
                label: (pos.rep || '?').slice(0, 1).toUpperCase(),
                title: pos.rep,
                popup: `<strong>${frappe.utils.escape_html(pos.rep)}</strong><br/>${ageMin} min ago` +
                       (pos.inside_geofence_name ? `<br/>📍 ${frappe.utils.escape_html(pos.inside_geofence_name)}` : '')
            });
        });
        mapHandle.addStopMarkers(stops);
    }

    function renderPlans(plans, positions) {
        const posByUser = {};
        positions.forEach((p) => { posByUser[p.rep] = p; });
        const $list = $body.find('.ding-mm-plans');
        $list.empty();
        if (!plans.length) {
            $list.append(`<div class="text-muted">${__('No plans for today.')}</div>`);
            return;
        }
        plans.forEach((plan) => {
            const live = posByUser[plan.assigned_to] ? '🟢' : '⚪';
            const $card = $(`
                <div class="ding-mm-plan-card" data-plan="${plan.name}">
                    <div class="ding-mm-plan-name">${live} ${frappe.utils.escape_html(plan.assigned_to)}</div>
                    <div class="ding-mm-plan-stats">
                        ${plan.summary_completed_count || 0}/${plan.summary_planned_count || 0} done ·
                        ${(plan.adherence_pct || 0).toFixed(0)}% adherence ·
                        ${plan.status}
                    </div>
                </div>
            `);
            $card.on('click', () => {
                $body.find('.ding-mm-plan-card').attr('data-active', '0');
                $card.attr('data-active', '1');
                frappe.set_route('Form', 'Day Plan', plan.name);
            });
            $list.append($card);
        });
    }

    function startPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(refresh, 60 * 1000);
    }

    $body.on('click', '.ding-mm-refresh', refresh);
};
