// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Lead Meet', {
    onload: function(frm) {
        if (!frm.doc.creator) {
            frm.set_value('creator', frm.doc.owner || frappe.session.user);
        }
    },

    refresh: function(frm) {
        frm.add_custom_button(__('Log Location'), function() {
            navigator.geolocation.getCurrentPosition(function(position) {
                frm.set_value('logged_geo_location', dingToGeoJSONPoint(
                    position.coords.latitude,
                    position.coords.longitude
                ));
            }, function(err) {
                frappe.show_alert({
                    message: __('Failed to fetch location: ') + (err && err.message),
                    indicator: 'red'
                });
            });
        });

        frm.add_custom_button(__('Get Directions'), function() {
            var coord = dingExtractLatLng(frm.doc.lead_location);
            if (!coord) {
                frappe.msgprint(__('Lead location is not set.'));
                return;
            }
            var url = 'https://www.google.com/maps?q=' + coord.lat + ',' + coord.lng;
            window.open(url, '_blank');
        });

        frm.add_custom_button(__('Start Meet'), function() {
            frm.set_value('check_in_time', frappe.datetime.now_datetime());
        });

        frm.add_custom_button(__('End Meet'), function() {
            frm.set_value('check_out_time', frappe.datetime.now_datetime());
        });

        frm.add_custom_button(__('Update Lead Location'), function() {
            if (frm.doc.lead) {
                window.open('/app/lead/' + encodeURIComponent(frm.doc.lead), '_blank');
            } else {
                frappe.msgprint(__('Please select a lead.'));
            }
        });

        // Convert-to-next-step actions, gated by docstatus + visit_type.
        if (frm.doc.docstatus === 1) {
            const vt = frm.doc.visit_type;
            if (vt === 'Sales' || vt === 'Demo') {
                frm.add_custom_button(__('Create Opportunity'), function() {
                    frappe.new_doc('Opportunity', {
                        opportunity_from: 'Lead',
                        party_name: frm.doc.lead
                    });
                }, __('Convert'));
            }
            if (vt === 'Service') {
                frm.add_custom_button(__('Create / Update Issue'), function() {
                    if (frm.doc.linked_doctype === 'Issue' && frm.doc.linked_name) {
                        window.open('/app/issue/' + encodeURIComponent(frm.doc.linked_name), '_blank');
                    } else {
                        frappe.new_doc('Issue', {
                            subject: 'Service visit follow-up: ' + (frm.doc.lead || ''),
                            description: frm.doc.comment || ''
                        });
                    }
                }, __('Convert'));
            }
            frm.add_custom_button(__('Add Note to Lead'), function() {
                window.open('/app/lead/' + encodeURIComponent(frm.doc.lead), '_blank');
            }, __('Convert'));
        }
    }
});

function dingToGeoJSONPoint(lat, lng) {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] }
        }]
    });
}

function dingExtractLatLng(geoValue) {
    if (!geoValue) return null;
    var obj = geoValue;
    if (typeof geoValue === 'string') {
        var s = geoValue.trim();
        if (!s) return null;
        if (s.indexOf('{') === 0) {
            try { obj = JSON.parse(s); } catch (e) { return null; }
        } else if (s.indexOf(',') > -1) {
            var parts = s.split(',');
            var lat = parseFloat(parts[0]);
            var lng = parseFloat(parts[1]);
            if (isNaN(lat) || isNaN(lng)) return null;
            return { lat: lat, lng: lng };
        } else {
            return null;
        }
    }
    if (!obj || typeof obj !== 'object') return null;
    var feats = obj.features || (obj.type === 'Feature' ? [obj] : []);
    for (var i = 0; i < feats.length; i++) {
        var geom = feats[i].geometry || (feats[i].type === 'Point' ? feats[i] : null);
        if (geom && geom.type === 'Point' && geom.coordinates && geom.coordinates.length >= 2) {
            return { lat: Number(geom.coordinates[1]), lng: Number(geom.coordinates[0]) };
        }
    }
    return null;
}
