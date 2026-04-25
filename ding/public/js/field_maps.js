// Copyright (c) 2026, manoj and contributors
// For license information, please see license.txt
//
// Shared maps helper used by Manager Map, My Field Day, Day Plan, and
// any other ding desk page that needs an embedded map. Loads Google Maps
// when the tenant has configured an API key; falls back to Leaflet+OSM
// otherwise. Both code paths expose the same `dingMaps.createMap` /
// `addStopMarkers` / `drawRoute` surface so callers don't have to branch.

(function () {
    'use strict';
    if (window.dingMaps) return;

    let configPromise = null;
    let googlePromise = null;
    let leafletPromise = null;

    function getConfig() {
        if (!configPromise) {
            configPromise = frappe.xcall('ding.field_sales.api.get_maps_config');
        }
        return configPromise;
    }

    function clearConfig() {
        configPromise = null;
    }

    function loadGoogleMaps(apiKey) {
        if (window.google && window.google.maps) return Promise.resolve(window.google);
        if (googlePromise) return googlePromise;
        googlePromise = new Promise((resolve, reject) => {
            const cb = `__dingGmapsCb_${Date.now()}`;
            window[cb] = () => { resolve(window.google); delete window[cb]; };
            const s = document.createElement('script');
            s.async = true;
            s.src = 'https://maps.googleapis.com/maps/api/js?'
                + 'key=' + encodeURIComponent(apiKey)
                + '&libraries=places,marker&loading=async&callback=' + cb;
            s.onerror = (e) => reject(new Error('Google Maps SDK load failed'));
            document.head.appendChild(s);
        });
        return googlePromise;
    }

    function loadLeaflet() {
        if (window.L) return Promise.resolve(window.L);
        if (leafletPromise) return leafletPromise;
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(css);
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            s.onload = () => resolve(window.L);
            s.onerror = reject;
            document.head.appendChild(s);
        });
        return leafletPromise;
    }

    /**
     * Create an embedded map inside `el`. Returns a `MapHandle` that
     * abstracts the underlying provider so callers can use the same API.
     *
     * Options:
     *   center: {lat, lng}  default Bengaluru
     *   zoom:   number      default 12
     */
    function createMap(el, options) {
        options = options || {};
        const center = options.center || { lat: 12.97, lng: 77.59 };
        const zoom = options.zoom || 12;
        return getConfig().then((cfg) => {
            if (cfg.has_google_key) {
                return loadGoogleMaps(cfg.api_key).then((google) =>
                    new GoogleMapHandle(el, google, center, zoom)
                );
            }
            return loadLeaflet().then((L) => new LeafletMapHandle(el, L, center, zoom));
        });
    }

    /**
     * GoogleMapHandle — wraps a google.maps.Map.
     */
    class GoogleMapHandle {
        constructor(el, google, center, zoom) {
            this.provider = 'google';
            this.google = google;
            this.markers = [];
            this.routePolyline = null;
            this.map = new google.maps.Map(el, {
                center, zoom, mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
            });
        }
        addStopMarkers(stops) {
            this._clearMarkers();
            const bounds = new this.google.maps.LatLngBounds();
            stops.forEach((stop, i) => {
                if (!stop.lat || !stop.lng) return;
                const pos = { lat: stop.lat, lng: stop.lng };
                const marker = new this.google.maps.Marker({
                    position: pos, map: this.map,
                    label: { text: String(stop.label || i + 1), color: 'white', fontWeight: 'bold' },
                    title: stop.title || ''
                });
                if (stop.popup) {
                    const info = new this.google.maps.InfoWindow({ content: stop.popup });
                    marker.addListener('click', () => info.open({ map: this.map, anchor: marker }));
                }
                this.markers.push(marker);
                bounds.extend(pos);
            });
            if (this.markers.length) this.map.fitBounds(bounds, 60);
        }
        drawRoute(coords) {
            if (this.routePolyline) this.routePolyline.setMap(null);
            if (!coords || coords.length < 2) return;
            this.routePolyline = new this.google.maps.Polyline({
                path: coords, map: this.map, geodesic: true,
                strokeColor: '#3b82f6', strokeOpacity: 0.85, strokeWeight: 3,
            });
        }
        _clearMarkers() {
            this.markers.forEach((m) => m.setMap(null));
            this.markers = [];
        }
        destroy() {
            this._clearMarkers();
            if (this.routePolyline) this.routePolyline.setMap(null);
        }
    }

    /**
     * LeafletMapHandle — wraps an L.Map. Same API surface as GoogleMapHandle.
     */
    class LeafletMapHandle {
        constructor(el, L, center, zoom) {
            this.provider = 'leaflet';
            this.L = L;
            this.markers = [];
            this.routeLine = null;
            this.map = L.map(el).setView([center.lat, center.lng], zoom);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19, attribution: '© OpenStreetMap'
            }).addTo(this.map);
        }
        addStopMarkers(stops) {
            this._clearMarkers();
            const bounds = [];
            stops.forEach((stop, i) => {
                if (!stop.lat || !stop.lng) return;
                const m = this.L.marker([stop.lat, stop.lng]).addTo(this.map);
                if (stop.popup) m.bindPopup(stop.popup);
                if (stop.title) m.bindTooltip(stop.title);
                this.markers.push(m);
                bounds.push([stop.lat, stop.lng]);
            });
            if (bounds.length) this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
        drawRoute(coords) {
            if (this.routeLine) this.map.removeLayer(this.routeLine);
            if (!coords || coords.length < 2) return;
            const latlngs = coords.map((c) => [c.lat, c.lng]);
            this.routeLine = this.L.polyline(latlngs, {
                color: '#3b82f6', weight: 3, opacity: 0.85
            }).addTo(this.map);
        }
        _clearMarkers() {
            this.markers.forEach((m) => this.map.removeLayer(m));
            this.markers = [];
        }
        destroy() {
            this._clearMarkers();
            if (this.routeLine) this.map.removeLayer(this.routeLine);
            this.map.remove();
        }
    }

    /**
     * Extract a {lat, lng} from a Frappe Geolocation field value.
     * Handles GeoJSON FeatureCollection, GeoJSON string, "lat,lng" legacy strings.
     */
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
        } catch (e) { /* fall through to legacy */ }
        if (typeof geoValue === 'string' && geoValue.indexOf(',') > -1) {
            const parts = geoValue.split(',');
            const lat = parseFloat(parts[0]);
            const lng = parseFloat(parts[1]);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
        return null;
    }

    /** Build a {lat, lng} into a GeoJSON Geolocation field value (string). */
    function toGeoJSONPoint(lat, lng) {
        return JSON.stringify({
            type: 'FeatureCollection',
            features: [{
                type: 'Feature', properties: {},
                geometry: { type: 'Point', coordinates: [Number(lng), Number(lat)] }
            }]
        });
    }

    /** Build a "Open in Maps" deep-link based on the configured directions provider. */
    function directionsURL(origin, destination, waypoints) {
        const o = origin ? `${origin.lat},${origin.lng}` : 'Current Location';
        const d = `${destination.lat},${destination.lng}`;
        const wps = (waypoints || []).map((w) => `${w.lat},${w.lng}`).join('|');
        return getConfig().then((cfg) => {
            if (cfg.directions_provider === 'OpenStreetMap (browser)') {
                return `https://www.openstreetmap.org/?mlat=${destination.lat}&mlon=${destination.lng}#map=14/${destination.lat}/${destination.lng}`;
            }
            // Google Maps URL is the default and most universally supported.
            const params = new URLSearchParams({ api: '1', origin: o, destination: d });
            if (wps) params.set('waypoints', wps);
            return 'https://www.google.com/maps/dir/?' + params.toString();
        });
    }

    window.dingMaps = {
        getConfig, clearConfig, createMap,
        extractLatLng, toGeoJSONPoint, directionsURL,
    };
})();
