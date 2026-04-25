// Copyright (c) 2024, manoj and contributors
// For license information, please see license.txt

frappe.ui.form.on('Customer Meet', {
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

        frm.add_custom_button(__('POS'), function() {
            if (frm.doc.customer) {
                window.open(
                    '/app/point-of-sale?customer=' + encodeURIComponent(frm.doc.customer),
                    '_blank'
                );
            } else {
                frappe.msgprint(__('Please select a customer.'));
            }
        });

        frm.add_custom_button(__('Get Directions'), function() {
            var coord = dingExtractLatLng(frm.doc.customer_location);
            if (!coord) {
                frappe.msgprint(__('Customer location is not set.'));
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

        frm.add_custom_button(__('Update Customer Location'), function() {
            if (frm.doc.customer) {
                window.open('/app/customer/' + encodeURIComponent(frm.doc.customer), '_blank');
            } else {
                frappe.msgprint(__('Please select a customer.'));
            }
        });

        // Convert-to-next-step actions, gated by docstatus + visit_type.
        if (frm.doc.docstatus === 1) {
            const vt = frm.doc.visit_type;
            if (vt === 'Sales' || vt === 'Demo') {
                frm.add_custom_button(__('Create Quotation'), function() {
                    frappe.new_doc('Quotation', {
                        quotation_to: 'Customer',
                        party_name: frm.doc.customer
                    });
                }, __('Convert'));
                frm.add_custom_button(__('Create Sales Order'), function() {
                    frappe.new_doc('Sales Order', { customer: frm.doc.customer });
                }, __('Convert'));
            }
            if (vt === 'Service') {
                frm.add_custom_button(__('Create / Update Issue'), function() {
                    if (frm.doc.linked_doctype === 'Issue' && frm.doc.linked_name) {
                        window.open('/app/issue/' + encodeURIComponent(frm.doc.linked_name), '_blank');
                    } else {
                        frappe.new_doc('Issue', {
                            customer: frm.doc.customer,
                            subject: 'Service visit follow-up: ' + (frm.doc.customer || ''),
                            description: frm.doc.comment || ''
                        });
                    }
                }, __('Convert'));
            }
            if (vt === 'Delivery' && frm.doc.linked_doctype === 'Delivery Note' && frm.doc.linked_name) {
                frm.add_custom_button(__('Open Delivery Note'), function() {
                    window.open('/app/delivery-note/' + encodeURIComponent(frm.doc.linked_name), '_blank');
                }, __('Convert'));
            }
            if (vt === 'Collection') {
                frm.add_custom_button(__('Record Payment'), function() {
                    const args = { party_type: 'Customer', party: frm.doc.customer };
                    if (frm.doc.linked_doctype === 'Sales Invoice' && frm.doc.linked_name) {
                        args.reference_doctype = 'Sales Invoice';
                        args.reference_name = frm.doc.linked_name;
                    }
                    frappe.new_doc('Payment Entry', args);
                }, __('Convert'));
            }
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
