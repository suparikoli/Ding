frappe.pages['my-field-day'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('My Field Day'),
        single_column: true
    });

    const $body = $(`
        <div class="ding-mfd">
            <div class="ding-mfd-header">
                <div class="ding-mfd-summary"></div>
                <div class="ding-mfd-cta-row">
                    <button class="btn btn-primary btn-sm ding-mfd-primary hidden"></button>
                    <button class="btn btn-default btn-sm ding-mfd-refresh">${__('Refresh')}</button>
                </div>
            </div>
            <div class="ding-mfd-map" id="ding-mfd-map"></div>
            <div class="ding-mfd-stops"></div>
            <div class="ding-mfd-empty hidden">
                <div class="ding-mfd-empty-icon">📋</div>
                <h4>${__('No plan for today.')}</h4>
                <p class="text-muted">${__('Create a Day Plan and add stops to start.')}</p>
                <button class="btn btn-primary ding-mfd-create">${__('+ Create today\\'s plan')}</button>
            </div>
        </div>
    `).appendTo(page.body);

    addStyles();
    let plan = null;
    let mapHandle = null;
    let heartbeatTimer = null;

    function addStyles() {
        if (document.getElementById('ding-mfd-styles')) return;
        const css = `
            .ding-mfd { padding: 12px; max-width: 860px; margin: 0 auto; }
            .ding-mfd-header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom: 16px; flex-wrap: wrap; }
            .ding-mfd-summary { font-size: 14px; color: var(--text-muted); }
            .ding-mfd-summary .strong { color: var(--text-color); font-weight: 600; }
            .ding-mfd-cta-row { display:flex; gap: 8px; }
            .ding-mfd-map { height: 280px; border-radius: 10px; margin-bottom: 14px; overflow: hidden; border: 1px solid var(--border-color); }
            .ding-mfd-map.hidden { display: none; }
            .ding-mfd-stop { background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px; margin-bottom: 10px; border-left-width: 4px; }
            .ding-mfd-stop[data-status="Done"] { opacity: 0.75; border-left-color: var(--green); }
            .ding-mfd-stop[data-status="In Progress"] { border-left-color: var(--blue); }
            .ding-mfd-stop[data-status="Skipped"] { opacity: 0.6; border-left-color: var(--gray-500); }
            .ding-mfd-stop[data-status="No Show"] { opacity: 0.6; border-left-color: var(--red); }
            .ding-mfd-stop[data-status="Pending"] { border-left-color: var(--gray-400); }
            .ding-mfd-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
            .ding-mfd-name { font-size: 16px; font-weight: 600; }
            .ding-mfd-meta { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
            .ding-mfd-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
            .ding-mfd-actions .btn { flex: 1; min-width: 80px; }
            .ding-mfd-status { font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--bg-light-gray); white-space: nowrap; }
            .ding-mfd-empty { text-align: center; padding: 60px 20px; color: var(--text-muted); }
            .ding-mfd-empty-icon { font-size: 40px; margin-bottom: 12px; }
            .hidden { display: none !important; }
        `;
        const tag = document.createElement('style');
        tag.id = 'ding-mfd-styles';
        tag.appendChild(document.createTextNode(css));
        document.head.appendChild(tag);
    }

    function load() {
        frappe.call({
            method: 'ding.field_sales.api.get_today_plan',
            callback: function(r) {
                plan = r.message && r.message.plan;
                render();
            }
        });
    }

    function render() {
        const $sum = $body.find('.ding-mfd-summary');
        const $stops = $body.find('.ding-mfd-stops');
        const $empty = $body.find('.ding-mfd-empty');
        const $map = $body.find('.ding-mfd-map');
        const $primary = $body.find('.ding-mfd-primary');
        $stops.empty();
        if (!plan) {
            $empty.removeClass('hidden');
            $sum.text('');
            $map.addClass('hidden');
            $primary.addClass('hidden');
            return;
        }
        $empty.addClass('hidden');
        $sum.html(`
            <span class="strong">${plan.summary_completed_count || 0}/${plan.summary_planned_count || 0}</span>
            ${__('done')} · ${__('Adherence')}: <span class="strong">${(plan.adherence_pct || 0).toFixed(0)}%</span>
        `);

        const sortedStops = (plan.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        const inProgress = sortedStops.find((s) => s.status === 'In Progress');
        const nextPending = sortedStops.find((s) => s.status === 'Pending');
        if (inProgress) {
            $primary.removeClass('hidden').text(`✋ ${__('End: {0}', [inProgress.client_name])}`)
                .off('click').on('click', () => doAction(inProgress, 'end'));
        } else if (nextPending) {
            $primary.removeClass('hidden').text(`▶ ${__('Start: {0}', [nextPending.client_name])}`)
                .off('click').on('click', () => doAction(nextPending, 'start'));
        } else {
            $primary.addClass('hidden');
        }

        sortedStops.forEach((stop) => $stops.append(renderStop(stop)));

        $map.removeClass('hidden');
        if (window.dingMaps) {
            ensureMap().then(() => {
                const stopsForMap = sortedStops
                    .map((s, i) => {
                        const c = window.dingMaps.extractLatLng(s.client_geolocation);
                        if (!c) return null;
                        const status = s.status === 'Done' ? '✅ ' : s.status === 'In Progress' ? '▶️ ' : '';
                        return {
                            lat: c.lat, lng: c.lng,
                            label: String(s.sequence || i + 1),
                            title: s.client_name,
                            popup: `${status}<strong>#${s.sequence || i + 1}</strong> · ${frappe.utils.escape_html(s.client_name)}<br/>` +
                                   `<span style="color:#666">${s.visit_type || ''} · ${s.status || 'Pending'}</span>`
                        };
                    })
                    .filter(Boolean);
                mapHandle.addStopMarkers(stopsForMap);
                mapHandle.drawRoute(stopsForMap.map((s) => ({ lat: s.lat, lng: s.lng })));
            });
        }
    }

    function ensureMap() {
        if (mapHandle) return Promise.resolve(mapHandle);
        return window.dingMaps.createMap(document.getElementById('ding-mfd-map'))
            .then((h) => { mapHandle = h; return h; });
    }

    function renderStop(stop) {
        const $card = $(`
            <div class="ding-mfd-stop" data-status="${stop.status || 'Pending'}" data-row="${stop.name}">
                <div class="ding-mfd-row">
                    <div>
                        <div class="ding-mfd-name">#${stop.sequence || ''} · ${frappe.utils.escape_html(stop.client_name || '')}</div>
                        <div class="ding-mfd-meta">
                            ${stop.visit_type || ''}${stop.planned_start_time ? ' · ' + stop.planned_start_time : ''}
                            ${stop.objective ? ' · ' + frappe.utils.escape_html(stop.objective) : ''}
                        </div>
                    </div>
                    <span class="ding-mfd-status">${stop.status || 'Pending'}</span>
                </div>
                <div class="ding-mfd-actions"></div>
            </div>
        `);

        const $actions = $card.find('.ding-mfd-actions');
        if (stop.status === 'Pending') {
            $actions.append(actionBtn('btn-primary', __('Start'), () => doAction(stop, 'start')));
            $actions.append(actionBtn('btn-default', __('Skip'), () => skip(stop)));
        } else if (stop.status === 'In Progress') {
            $actions.append(actionBtn('btn-primary', __('End'), () => doAction(stop, 'end')));
        }
        if (stop.client_geolocation) {
            $actions.append(actionBtn('btn-default', __('Navigate'), () => navigate(stop)));
        }
        if (stop.survey_web_form) {
            $actions.append(actionBtn('btn-default', __('Open Survey'), () => openSurvey(stop)));
        }
        return $card;
    }

    function actionBtn(cls, label, onClick) {
        const $b = $(`<button class="btn ${cls} btn-sm">${label}</button>`);
        $b.on('click', onClick);
        return $b;
    }

    function doAction(stop, action, payload) {
        frappe.call({
            method: 'ding.field_sales.api.stop_action',
            freeze: true,
            args: {
                plan_name: plan.name,
                stop_row: stop.name,
                action: action,
                payload: payload || ''
            },
            callback: load
        });
    }

    function skip(stop) {
        frappe.prompt({
            label: __('Skip Reason'),
            fieldname: 'reason',
            fieldtype: 'Small Text',
            reqd: 1
        }, (vals) => doAction(stop, 'skip', vals.reason), __('Skip stop'));
    }

    function navigate(stop) {
        const coord = window.dingMaps.extractLatLng(stop.client_geolocation);
        if (!coord) return frappe.show_alert({ message: __('No location'), indicator: 'orange' });
        window.dingMaps.directionsURL(null, coord).then((url) => window.open(url, '_blank'));
    }

    function openSurvey(stop) {
        if (!stop.survey_web_form) return;
        window.open('/' + encodeURIComponent(stop.survey_web_form), '_blank');
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        const ping = function() {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(function(pos) {
                frappe.call({
                    method: 'ding.field_sales.api.heartbeat',
                    args: {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        accuracy_m: pos.coords.accuracy
                    }
                });
            }, function() { /* ignore */ });
        };
        ping();
        heartbeatTimer = setInterval(ping, 5 * 60 * 1000);
    }

    $body.on('click', '.ding-mfd-refresh', load);
    $body.on('click', '.ding-mfd-create', () => {
        frappe.new_doc('Day Plan', {
            assigned_to: frappe.session.user,
            plan_date: frappe.datetime.get_today()
        });
    });

    load();
    startHeartbeat();
};
