// BrandGlobe — needs Globe, topojson, WORLD_TOPO loaded as globals.
(function (global) {
    'use strict';

    var DEFAULT_HUBS = [];

    var DEFAULTS = {
        container: '#globe-container',
        padding: 18,
        overflow: 80,
        scale: 1,
        colors: {
            globe:      '#004972',
            accent:     '#F39323',
            atmosphere: '#1d6791',
            stroke:     'rgba(255, 184, 92, 0.95)',
            arcStart:   'rgba(255, 170, 60, 1)',
            arcEnd:     'rgba(255, 170, 60, 1)',
            hubPoint:   '#ffffff',
            hubRing:    '#ffffff'
        },
        globe: {
            opacity: 0.92,
            shininess: 14
        },
        atmosphere: {
            enabled: true,
            altitude: 0.22
        },
        rotation:    { enabled: true, speed: 0.55 },
        interaction: { enabled: true },
        initialView: { lat: 18, lng: 18, altitude: 1.7 },
        polygons: {
            enabled: true,
            style: 'filled',   // 'filled' | 'hex' (hex needs http hosting)
            altitude: 0.008,
            capOpacity: 0.88,
            wireframe: { enabled: true, color: '#ffffff', opacity: 0.55 },
            hexResolution: 3,
            hexMargin: 0.3,
            hexUseDots: false
        },
        arcs: {
            enabled: true,
            strokeWidth: 0.55,
            dashLength: 1, dashGap: 0,
            animateTime: 0,
            altitudeAutoScale: 0.45,
            refreshInterval: 0
        },
        connections: [],
        points: {
            enabled: true,
            radius: 0.55,
            altitude: 0.01
        },
        rings: {
            enabled: true,
            maxRadius: 3,
            propagationSpeed: 1.6,
            repeatPeriod: 1800
        },
        hubs: DEFAULT_HUBS
    };

    function isPlainObject(v) {
        return v && typeof v === 'object' && !Array.isArray(v);
    }

    function deepMerge(base, override) {
        var out = {};
        Object.keys(base).forEach(function (k) { out[k] = base[k]; });
        if (!override) return out;
        Object.keys(override).forEach(function (k) {
            if (isPlainObject(base[k]) && isPlainObject(override[k])) {
                out[k] = deepMerge(base[k], override[k]);
            } else {
                out[k] = override[k];
            }
        });
        return out;
    }

    function rgbaFromHex(hex, alpha) {
        var h = hex.replace('#', '');
        if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
        var r = parseInt(h.substr(0, 2), 16);
        var g = parseInt(h.substr(2, 2), 16);
        var b = parseInt(h.substr(4, 2), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function BrandGlobe(options) {
        this.options = deepMerge(DEFAULTS, options || {});
        this._arcRefreshTimer = null;
        this._resizeHandler = null;
        this._features = null;
        this._wireframeMeshes = [];
        this._init();
    }

    BrandGlobe.DEFAULTS = DEFAULTS;

    BrandGlobe.prototype._init = function () {
        var opts = this.options;
        this.container = typeof opts.container === 'string'
            ? document.querySelector(opts.container)
            : opts.container;

        if (!this.container) {
            console.warn('[BrandGlobe] container not found:', opts.container);
            return;
        }
        if (typeof global.Globe === 'undefined') {
            console.warn('[BrandGlobe] globe.gl not loaded');
            return;
        }

        // Stage extends `overflow` px past the container so arcs can render outside it.
        var paddingPx  = Math.max(0, opts.padding  | 0);
        var overflowPx = Math.max(0, opts.overflow | 0);
        this._paddingPx  = paddingPx;
        this._overflowPx = overflowPx;

        this.container.style.boxSizing = 'border-box';
        this.container.style.padding   = paddingPx + 'px';
        this.container.style.position  = 'relative';
        this.container.style.overflow  = 'visible';

        this.stage = document.createElement('div');
        this.stage.style.cssText = (
            'position:absolute;' +
            'top:'    + (-overflowPx) + 'px;' +
            'left:'   + (-overflowPx) + 'px;' +
            'right:'  + (-overflowPx) + 'px;' +
            'bottom:' + (-overflowPx) + 'px;' +
            'pointer-events:inherit;'
        );
        this.container.appendChild(this.stage);

        this.globe = global.Globe()(this.stage)
            .backgroundColor('rgba(0, 0, 0, 0)')
            .showAtmosphere(opts.atmosphere.enabled)
            .atmosphereColor(opts.colors.atmosphere)
            .atmosphereAltitude(opts.atmosphere.altitude)
            .showGraticules(false);

        this.container.style.pointerEvents = opts.interaction.enabled ? 'auto' : 'none';

        this._applyGlobeMaterial();
        this._applyControls();

        this.globe.pointOfView({
            lat: opts.initialView.lat,
            lng: opts.initialView.lng,
            altitude: this._effectiveAltitude()
        }, 0);

        if (opts.polygons.enabled) this._applyPolygons();
        if (opts.arcs.enabled)     this._applyArcs();
        if (opts.points.enabled)   this._applyPoints();
        if (opts.rings.enabled)    this._applyRings();

        this._applyResize();
        this._startArcRefresh();
    };

    BrandGlobe.prototype._applyGlobeMaterial = function () {
        // Mutate the existing material — avoids "Multiple instances of Three.js" conflicts.
        var mat = this.globe.globeMaterial();
        mat.color.set(this.options.colors.globe);
        mat.transparent = true;
        mat.opacity = this.options.globe.opacity;
        if ('shininess' in mat) mat.shininess = this.options.globe.shininess;
        mat.needsUpdate = true;
    };

    BrandGlobe.prototype._applyControls = function () {
        var c = this.globe.controls();
        c.autoRotate = this.options.rotation.enabled;
        c.autoRotateSpeed = this.options.rotation.speed;
        c.enableZoom = false;
        c.enablePan = false;
        c.enableDamping = true;
        c.dampingFactor = 0.08;
    };

    BrandGlobe.prototype._applyPolygons = function () {
        if (!global.WORLD_TOPO || !global.topojson) {
            console.warn('[BrandGlobe] WORLD_TOPO or topojson missing — countries will not render');
            return;
        }
        if (!this._features) {
            this._features = global.topojson
                .feature(global.WORLD_TOPO, global.WORLD_TOPO.objects.countries).features;
        }
        if (this.options.polygons.style === 'hex') {
            this._applyHexPolygons(this._features);
        } else {
            this._applyFilledPolygons(this._features);
        }
    };

    BrandGlobe.prototype._applyFilledPolygons = function (features) {
        var cap = rgbaFromHex(this.options.colors.accent, this.options.polygons.capOpacity);
        var stroke = this.options.colors.stroke;
        // Invisible sides — otherwise they bleed through the transparent sphere.
        this.globe
            .polygonsData(features)
            .polygonAltitude(this.options.polygons.altitude)
            .polygonCapColor(function () { return cap; })
            .polygonSideColor(function () { return 'rgba(0,0,0,0)'; })
            .polygonStrokeColor(function () { return stroke; });

        if (this.options.polygons.wireframe && this.options.polygons.wireframe.enabled) {
            this._applyPolygonWireframe();
        }
        this._bumpStrokeRenderOrder();
    };

    BrandGlobe.prototype._bumpStrokeRenderOrder = function () {
        // Force polygon stroke lines to render last so they sit on top of wireframe / cap.
        var scene = this.globe.scene();
        var attempts = 0;
        function bump() {
            var found = 0;
            scene.traverse(function (o) {
                if (!o.isLine && !o.isLine2 && o.type !== 'Line2' && o.type !== 'Line') return;
                if (o.userData.__strokeBumped) return;
                if (o.material && 'depthTest' in o.material) {
                    o.material.depthTest = false;
                    o.material.needsUpdate = true;
                }
                o.renderOrder = 10;
                o.userData.__strokeBumped = true;
                found++;
            });
            if (found === 0 && attempts++ < 25) setTimeout(bump, 200);
        }
        bump();
    };

    BrandGlobe.prototype._applyPolygonWireframe = function () {
        // Attach a sibling mesh per polygon with wireframe material → triangulation overlay.
        // Reuses scene constructors so we stay inside globe.gl's THREE instance.
        var settings = this.options.polygons.wireframe;
        var scene = this.globe.scene();
        var attempts = 0;
        var self = this;

        function attach() {
            var added = 0;
            scene.traverse(function (obj) {
                if (!obj.isMesh) return;
                if (obj.userData.__wireframeAttached) return;
                if (obj.userData.__isWireframeOverlay) return;
                var g = obj.geometry;
                if (!g || !g.attributes || !g.attributes.position) return;
                if (/Sphere|Cylinder|Tube/.test(g.type)) return;
                if (g.attributes.position.count < 30) return;

                // Polygon caps have an array material — unwrap to first for the class.
                var MeshClass = obj.constructor;
                var sourceMat = Array.isArray(obj.material) ? obj.material[0] : obj.material;
                if (!sourceMat || !sourceMat.constructor) return;
                var MaterialClass = sourceMat.constructor;
                var wfMat = new MaterialClass();
                wfMat.wireframe = true;
                if (wfMat.color && wfMat.color.set) wfMat.color.set(settings.color);
                wfMat.transparent = true;
                wfMat.opacity = settings.opacity;
                wfMat.depthWrite = false;
                wfMat.polygonOffset = true;
                wfMat.polygonOffsetFactor = -1;
                wfMat.polygonOffsetUnits = -1;
                if (wfMat.emissive && wfMat.emissive.set) wfMat.emissive.set(settings.color);
                wfMat.needsUpdate = true;

                var wfMesh = new MeshClass(g, wfMat);
                wfMesh.userData.__isWireframeOverlay = true;
                wfMesh.renderOrder = 1;
                obj.add(wfMesh);
                obj.userData.__wireframeAttached = true;
                self._wireframeMeshes.push(wfMesh);
                added++;
            });
            if (added === 0 && attempts++ < 25) {
                setTimeout(attach, 200);
            }
        }
        attach();
    };

    BrandGlobe.prototype._applyHexPolygons = function (features) {
        var color = rgbaFromHex(this.options.colors.accent, this.options.polygons.capOpacity);
        this.globe
            .hexPolygonsData(features)
            .hexPolygonResolution(this.options.polygons.hexResolution)
            .hexPolygonMargin(this.options.polygons.hexMargin)
            .hexPolygonAltitude(this.options.polygons.altitude)
            .hexPolygonColor(function () { return color; });
        // hexPolygonUseDots only exists on newer globe.gl versions; call defensively.
        if (typeof this.globe.hexPolygonUseDots === 'function') {
            this.globe.hexPolygonUseDots(this.options.polygons.hexUseDots);
        }
    };

    BrandGlobe.prototype._makeArcs = function () {
        var hubs = this.options.hubs || [];
        var connections = this.options.connections || [];
        if (connections.length === 0) return [];

        var byName = {};
        for (var i = 0; i < hubs.length; i++) {
            if (hubs[i].name) byName[hubs[i].name] = hubs[i];
        }

        var arcs = [];
        for (var c = 0; c < connections.length; c++) {
            var conn = connections[c];
            var from = byName[conn.from];
            if (!from) {
                console.warn('[BrandGlobe] unknown connection.from name:', conn.from);
                continue;
            }
            var toList = Array.isArray(conn.to) ? conn.to : [conn.to];
            for (var t = 0; t < toList.length; t++) {
                var to = byName[toList[t]];
                if (!to) {
                    console.warn('[BrandGlobe] unknown connection.to name:', toList[t]);
                    continue;
                }
                arcs.push({
                    startLat: from.lat, startLng: from.lng,
                    endLat:   to.lat,   endLng:   to.lng,
                    fromName: conn.from, toName: toList[t]
                });
            }
        }
        return arcs;
    };

    BrandGlobe.prototype._applyArcs = function () {
        var start = this.options.colors.arcStart;
        var end = this.options.colors.arcEnd;
        this.globe
            .arcsData(this._makeArcs())
            .arcColor(function () { return [start, end]; })
            .arcStroke(this.options.arcs.strokeWidth)
            .arcDashLength(this.options.arcs.dashLength)
            .arcDashGap(this.options.arcs.dashGap)
            .arcDashInitialGap(0)
            .arcDashAnimateTime(this.options.arcs.animateTime)
            .arcAltitudeAutoScale(this.options.arcs.altitudeAutoScale);
    };

    BrandGlobe.prototype._applyPoints = function () {
        var defaultHubColor = this.options.colors.hubPoint;
        this.globe
            .pointsData(this.options.hubs)
            .pointLat('lat')
            .pointLng('lng')
            .pointColor(function (h) { return h.color || defaultHubColor; })
            .pointAltitude(this.options.points.altitude)
            .pointRadius(this.options.points.radius)
            .pointLabel(function (h) { return h.name || ''; })
            .pointsMerge(false);
    };

    BrandGlobe.prototype._applyRings = function () {
        var defaultColor = this.options.colors.hubRing;
        function rgbPrefixOf(hex) {
            var h = hex.replace('#', '');
            if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
            var r = parseInt(h.substr(0, 2), 16);
            var g = parseInt(h.substr(2, 2), 16);
            var b = parseInt(h.substr(4, 2), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',';
        }
        var ringColorFn = function (hub) {
            var prefix = rgbPrefixOf(hub.color || defaultColor);
            return function (t) { return prefix + (1 - t).toFixed(2) + ')'; };
        };
        this.globe
            .ringsData(this.options.hubs)
            .ringLat('lat')
            .ringLng('lng')
            .ringMaxRadius(this.options.rings.maxRadius)
            .ringPropagationSpeed(this.options.rings.propagationSpeed)
            .ringRepeatPeriod(this.options.rings.repeatPeriod)
            .ringColor(ringColorFn);
    };

    BrandGlobe.prototype._effectiveAltitude = function () {
        // Camera pushed back proportionally so globe stays sized to visible area despite overflow.
        var containerW = this.container.clientWidth;
        var visibleW = Math.max(1, containerW - 2 * this._paddingPx);
        var canvasW = containerW + 2 * this._overflowPx;
        var ratio = canvasW / visibleW;
        var s = this.options.scale > 0 ? this.options.scale : 1;
        return (this.options.initialView.altitude * ratio) / s;
    };

    BrandGlobe.prototype._applyResize = function () {
        var self = this;
        this._resizeHandler = function () {
            self.globe.width(self.stage.clientWidth).height(self.stage.clientHeight);
            var pov = self.globe.pointOfView();
            self.globe.pointOfView({
                lat: pov.lat, lng: pov.lng,
                altitude: self._effectiveAltitude()
            }, 0);
        };
        this._resizeHandler();
        global.addEventListener('resize', this._resizeHandler);
    };

    BrandGlobe.prototype._startArcRefresh = function () {
        if (!this.options.arcs.enabled) return;
        var interval = this.options.arcs.refreshInterval;
        if (!interval || interval <= 0) return;
        var self = this;
        this._arcRefreshTimer = setInterval(function () {
            self.globe.arcsData(self._makeArcs());
        }, interval);
    };

    // Public runtime setters

    BrandGlobe.prototype.setRotation = function (enabled) {
        this.options.rotation.enabled = !!enabled;
        this.globe.controls().autoRotate = !!enabled;
        return this;
    };

    BrandGlobe.prototype.setRotationSpeed = function (speed) {
        this.options.rotation.speed = speed;
        this.globe.controls().autoRotateSpeed = speed;
        return this;
    };

    BrandGlobe.prototype.setInteraction = function (enabled) {
        this.options.interaction.enabled = !!enabled;
        var c = this.globe.controls();
        c.enableRotate = !!enabled;
        this.container.style.pointerEvents = enabled ? 'auto' : 'none';
        return this;
    };

    BrandGlobe.prototype.setScale = function (scale) {
        this.options.scale = scale > 0 ? scale : 1;
        var pov = this.globe.pointOfView();
        this.globe.pointOfView({
            lat: pov.lat, lng: pov.lng,
            altitude: this._effectiveAltitude()
        }, 300);
        return this;
    };

    BrandGlobe.prototype.setPadding = function (px) {
        this._paddingPx = Math.max(0, px | 0);
        this.options.padding = this._paddingPx;
        this.container.style.padding = this._paddingPx + 'px';
        if (this._resizeHandler) this._resizeHandler();
        return this;
    };

    BrandGlobe.prototype.setOverflow = function (px) {
        this._overflowPx = Math.max(0, px | 0);
        this.options.overflow = this._overflowPx;
        this.stage.style.top    = (-this._overflowPx) + 'px';
        this.stage.style.left   = (-this._overflowPx) + 'px';
        this.stage.style.right  = (-this._overflowPx) + 'px';
        this.stage.style.bottom = (-this._overflowPx) + 'px';
        if (this._resizeHandler) this._resizeHandler();
        return this;
    };

    BrandGlobe.prototype.setGlobeColor = function (hex) {
        this.options.colors.globe = hex;
        var mat = this.globe.globeMaterial();
        mat.color.set(hex);
        mat.needsUpdate = true;
        return this;
    };

    BrandGlobe.prototype.setGlobeOpacity = function (opacity) {
        this.options.globe.opacity = opacity;
        var mat = this.globe.globeMaterial();
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.needsUpdate = true;
        return this;
    };

    BrandGlobe.prototype.setAccentColor = function (hex) {
        this.options.colors.accent = hex;
        var cap = rgbaFromHex(hex, this.options.polygons.capOpacity);
        this.globe.polygonCapColor(function () { return cap; });
        return this;
    };

    BrandGlobe.prototype.setStrokeColor = function (color) {
        this.options.colors.stroke = color;
        this.globe.polygonStrokeColor(function () { return color; });
        return this;
    };

    BrandGlobe.prototype.setAtmosphereColor = function (hex) {
        this.options.colors.atmosphere = hex;
        this.globe.atmosphereColor(hex);
        return this;
    };

    BrandGlobe.prototype.setAtmosphereEnabled = function (enabled) {
        this.options.atmosphere.enabled = !!enabled;
        this.globe.showAtmosphere(!!enabled);
        return this;
    };

    BrandGlobe.prototype.setHubColor = function (hex) {
        this.options.colors.hubPoint = hex;
        this.options.colors.hubRing = hex;
        this.globe.pointColor(function (h) { return h.color || hex; });
        function rgbPrefixOf(c) {
            var hh = c.replace('#', '');
            if (hh.length === 3) hh = hh.split('').map(function (x) { return x + x; }).join('');
            var r = parseInt(hh.substr(0, 2), 16);
            var g = parseInt(hh.substr(2, 2), 16);
            var b = parseInt(hh.substr(4, 2), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',';
        }
        this.globe.ringColor(function (hub) {
            var prefix = rgbPrefixOf(hub.color || hex);
            return function (t) { return prefix + (1 - t).toFixed(2) + ')'; };
        });
        return this;
    };

    BrandGlobe.prototype.setArcColor = function (hex) {
        this.options.colors.arcStart = hex;
        this.options.colors.arcEnd = hex;
        this.globe.arcColor(function () { return [hex, hex]; });
        return this;
    };

    BrandGlobe.prototype.setWireframeColor = function (hex) {
        this.options.polygons.wireframe.color = hex;
        for (var i = 0; i < this._wireframeMeshes.length; i++) {
            var m = this._wireframeMeshes[i].material;
            if (m && m.color && m.color.set) m.color.set(hex);
            if (m && m.emissive && m.emissive.set) m.emissive.set(hex);
            if (m) m.needsUpdate = true;
        }
        return this;
    };

    BrandGlobe.prototype.setWireframeOpacity = function (opacity) {
        this.options.polygons.wireframe.opacity = opacity;
        for (var i = 0; i < this._wireframeMeshes.length; i++) {
            var m = this._wireframeMeshes[i].material;
            if (m) { m.opacity = opacity; m.transparent = true; m.needsUpdate = true; }
        }
        return this;
    };

    BrandGlobe.prototype.setWireframeEnabled = function (enabled) {
        this.options.polygons.wireframe.enabled = !!enabled;
        for (var i = 0; i < this._wireframeMeshes.length; i++) {
            this._wireframeMeshes[i].visible = !!enabled;
        }
        return this;
    };

    BrandGlobe.prototype.setBordersEnabled = function (enabled) {
        this.options.polygons.bordersEnabled = !!enabled;
        var stroke = this.options.colors.stroke;
        // Return null when off so globe.gl skips line rendering entirely (transparent rgba
        // would still render as black because WebGL lines don't blend alpha cleanly).
        this.globe.polygonStrokeColor(function () { return enabled ? stroke : null; });
        return this;
    };

    BrandGlobe.prototype.setPointsEnabled = function (enabled) {
        this.options.points.enabled = !!enabled;
        this.globe.pointsData(enabled ? this.options.hubs : []);
        return this;
    };

    BrandGlobe.prototype.setRingsEnabled = function (enabled) {
        this.options.rings.enabled = !!enabled;
        if (enabled) this._applyRings();
        else this.globe.ringsData([]);
        return this;
    };

    BrandGlobe.prototype.setArcsEnabled = function (enabled) {
        this.options.arcs.enabled = !!enabled;
        this.globe.arcsData(enabled ? this._makeArcs() : []);
        return this;
    };

    BrandGlobe.prototype.setHubs = function (hubs) {
        this.options.hubs = hubs;
        if (this.options.points.enabled) this._applyPoints();
        if (this.options.rings.enabled)  this._applyRings();
        if (this.options.arcs.enabled)   this.globe.arcsData(this._makeArcs());
        return this;
    };

    BrandGlobe.prototype.setConnections = function (connections) {
        this.options.connections = connections || [];
        if (this.options.arcs.enabled) this.globe.arcsData(this._makeArcs());
        return this;
    };

    BrandGlobe.prototype.refreshArcs = function () {
        if (this.options.arcs.enabled) this.globe.arcsData(this._makeArcs());
        return this;
    };

    // flyTo(name) or flyTo({lat, lng})
    BrandGlobe.prototype.flyTo = function (target, duration) {
        var d = typeof duration === 'number' ? duration : 1200;
        var lat, lng;
        if (typeof target === 'string') {
            var hub = null;
            for (var i = 0; i < this.options.hubs.length; i++) {
                if (this.options.hubs[i].name === target) { hub = this.options.hubs[i]; break; }
            }
            if (!hub) { console.warn('[BrandGlobe] flyTo: hub not found:', target); return this; }
            lat = hub.lat; lng = hub.lng;
        } else if (target && typeof target.lat === 'number' && typeof target.lng === 'number') {
            lat = target.lat; lng = target.lng;
        } else {
            return this;
        }
        this.globe.pointOfView({ lat: lat, lng: lng, altitude: this._effectiveAltitude() }, d);
        return this;
    };

    BrandGlobe.prototype.onGlobeClick = function (handler) {
        this.globe.onGlobeClick(handler);
        return this;
    };

    // Fires for clicks on the globe sphere AND on country polygons.
    BrandGlobe.prototype.onClick = function (handler) {
        this.globe.onGlobeClick(function (coords) { handler(coords); });
        this.globe.onPolygonClick(function (polygon, event, coords) { handler(coords); });
        return this;
    };

    BrandGlobe.prototype.destroy = function () {
        if (this._arcRefreshTimer) clearInterval(this._arcRefreshTimer);
        if (this._resizeHandler) global.removeEventListener('resize', this._resizeHandler);
        if (this.globe && this.globe._destructor) this.globe._destructor();
        this.globe = null;
    };

    global.BrandGlobe = BrandGlobe;
})(window);
