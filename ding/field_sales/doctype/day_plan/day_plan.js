// Copyright (c) 2026, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Day Plan', {
    onload: function(frm) {
        if (frm.is_new() && !frm.doc.assigned_to) {
            frm.set_value('assigned_to', frappe.session.user);
        }
        if (frm.is_new() && !frm.doc.plan_date) {
            frm.set_value('plan_date', frappe.datetime.get_today());
        }
        // Sortable child grid by sequence — drag to reorder.
        if (frm.fields_dict.stops && frm.fields_dict.stops.grid) {
            frm.fields_dict.stops.grid.sortable_status = true;
        }
    },

    refresh: function(frm) {
        // Top-of-form headline showing today's progress at a glance.
        if (!frm.is_new() && frm.doc.summary_planned_count) {
            const done = frm.doc.summary_completed_count || 0;
            const total = frm.doc.summary_planned_count || 0;
            const adh = (frm.doc.adherence_pct || 0).toFixed(0);
            const color = adh >= 80 ? 'green' : adh >= 50 ? 'orange' : 'red';
            frm.dashboard.set_headline_alert(
                `<strong>${done}/${total}</strong> done · <strong>${adh}%</strong> adherence`,
                color
            );
        }

        // First-run nudge — point the admin at maps settings if Google has no key yet.
        if (frappe.user.has_role && frappe.user.has_role('System Manager') && !frm.is_new()) {
            if (window.dingMaps) {
                window.dingMaps.getConfig().then((cfg) => {
                    if (cfg.provider === 'Google' && !cfg.api_key) {
                        frm.dashboard.add_comment(
                            __('Tip: add your Google Maps API key in {0} for the richer map view.',
                                ['<a href="/app/field-sales-settings">Field Sales Settings</a>']),
                            'blue', true
                        );
                    }
                });
            }
        }

        if (!frm.is_new() && frm.doc.docstatus === 0) {
            frm.add_custom_button(__('Optimize Sequence'), function() {
                frm.save().then(function() {
                    frappe.call({
                        method: 'ding.field_sales.doctype.day_plan.day_plan.optimize_day_plan',
                        args: { plan_name: frm.doc.name },
                        freeze: true,
                        freeze_message: __('Optimizing route…'),
                        callback: function(r) {
                            if (r.message && r.message.changed) {
                                frappe.show_alert({
                                    message: __('Sequence optimized. Planned distance: ') +
                                        (r.message.planned_distance_m || 0).toFixed(1) + ' m',
                                    indicator: 'green'
                                });
                                frm.reload_doc();
                            } else {
                                frappe.msgprint(__('No change: ') + (r.message && r.message.reason || 'unknown'));
                            }
                        }
                    });
                });
            }, __('Route'));

            frm.add_custom_button(__('Open in Maps'), function() {
                frappe.call({
                    method: 'ding.field_sales.doctype.day_plan.day_plan.directions_url_for_plan',
                    args: { plan_name: frm.doc.name },
                    callback: function(r) {
                        if (r.message) window.open(r.message, '_blank');
                    }
                });
            }, __('Route'));

            frm.add_custom_button(__('Set Start to Current Location'), function() {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    frm.set_value('start_geolocation', dayPlanGeoJSON(
                        pos.coords.latitude, pos.coords.longitude
                    ));
                });
            }, __('Route'));

            frm.add_custom_button(__('Apply Template'), function() {
                const dialog = new frappe.ui.Dialog({
                    title: __('Apply a Template'),
                    fields: [{
                        label: __('Template'), fieldname: 'template',
                        fieldtype: 'Link', options: 'Visit Plan Template',
                        get_query: () => ({ filters: { active: 1 } }),
                        reqd: 1
                    }],
                    primary_action_label: __('Apply'),
                    primary_action: function(values) {
                        frappe.call({
                            method: 'frappe.client.get',
                            args: { doctype: 'Visit Plan Template', name: values.template }
                        }).then(() => {
                            return frappe.call({
                                method: 'ding.field_sales.doctype.visit_plan_template.visit_plan_template.apply_template',
                                args: { template: values.template, plan_name: frm.doc.name }
                            });
                        }).then((r) => {
                            dialog.hide();
                            if (r && r.message) frm.reload_doc();
                        });
                    }
                });
                dialog.show();
            }, __('Stops'));

            if (frm.doc.status === 'Draft') {
                frm.add_custom_button(__('Release Plan'), function() {
                    frm.set_value('status', 'Released');
                    frm.save();
                });
            }
        }

        // Per-stop quick actions — rendered as buttons in the row's actions column.
        if (frm.fields_dict.stops && frm.fields_dict.stops.grid) {
            const grid = frm.fields_dict.stops.grid;
            grid.add_custom_button(__('Start'), function() {
                _runOnSelectedStops(frm, 'start');
            });
            grid.add_custom_button(__('End'), function() {
                _runOnSelectedStops(frm, 'end');
            });
            grid.add_custom_button(__('Skip'), function() {
                frappe.prompt({
                    label: __('Skip Reason'),
                    fieldname: 'reason',
                    fieldtype: 'Small Text',
                    reqd: 1
                }, function(values) {
                    _runOnSelectedStops(frm, 'skip', values.reason);
                }, __('Skip stop(s)'));
            });
        }

        // Render the route preview map (Google when configured, OSM fallback).
        _renderRouteMap(frm);
    },

    stops_on_form_rendered: function(frm) {
        _renderRouteMap(frm);
    }
});

let _dayPlanMapHandle = null;
function _renderRouteMap(frm) {
    if (!window.dingMaps) return;
    const el = document.getElementById('day-plan-route-map');
    if (!el) return;
    const stops = (frm.doc.stops || []).slice().sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    const start = window.dingMaps.extractLatLng(frm.doc.start_geolocation);
    const points = [];
    if (start) points.push({ lat: start.lat, lng: start.lng, label: '🏁', title: __('Start') });
    stops.forEach((s, i) => {
        const c = window.dingMaps.extractLatLng(s.client_geolocation);
        if (!c) return;
        const status = s.status === 'Done' ? '✅ ' : s.status === 'In Progress' ? '▶️ ' : '';
        points.push({
            lat: c.lat, lng: c.lng,
            label: String(s.sequence || i + 1),
            title: s.client_name,
            popup: `${status}<strong>#${s.sequence || i + 1}</strong> · ${frappe.utils.escape_html(s.client_name || '')}<br/>` +
                   `<span style="color:#666">${s.visit_type || ''} · ${s.status || 'Pending'}</span>`
        });
    });

    const ensure = _dayPlanMapHandle
        ? Promise.resolve(_dayPlanMapHandle)
        : window.dingMaps.createMap(el).then((h) => { _dayPlanMapHandle = h; return h; });

    ensure.then((handle) => {
        handle.addStopMarkers(points);
        handle.drawRoute(points.map((p) => ({ lat: p.lat, lng: p.lng })));
    });
}

function _runOnSelectedStops(frm, action, payload) {
    const selected = frm.fields_dict.stops.grid.get_selected_children();
    if (!selected || !selected.length) {
        frappe.msgprint(__('Select one or more stops first.'));
        return;
    }
    const calls = selected.map(function(stop) {
        return frappe.call({
            method: 'ding.field_sales.api.stop_action',
            args: {
                plan_name: frm.doc.name,
                stop_row: stop.name,
                action: action,
                payload: payload || ''
            }
        });
    });
    Promise.all(calls).then(function() { frm.reload_doc(); });
}

function dayPlanGeoJSON(lat, lng) {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] }
        }]
    });
}
