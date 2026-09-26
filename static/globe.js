(function () {
  var api = AtlasCommon.api;
  var escapeHtml = AtlasCommon.escapeHtml;

  /* =====================================================================
     3D GLOBE (Three.js) with real country borders + delivery zones
     Delivery zones are drawn as red circular caps (center + radius in km);
     everything outside any zone stays the default green land color.
     ===================================================================== */
  var GLOBE_RADIUS = 100;
  var EARTH_CIRCUMFERENCE_KM = 40075;
  var KM_PER_RADIAN = EARTH_CIRCUMFERENCE_KM / (2 * Math.PI);

  var globeScene, globeCamera, globeRenderer, globeGroup;
  var isDragging = false, lastX = 0, lastY = 0;
  var rotY = 0.6, rotX = -0.3;
  var zoomDist = 260;
  var zoneGroup = null;

  function latLonToVec3(lat, lon, radius) {
    var phi = (90 - lat) * (Math.PI / 180);
    var theta = (lon + 180) * (Math.PI / 180);
    var x = -(radius * Math.sin(phi) * Math.cos(theta));
    var z = (radius * Math.sin(phi) * Math.sin(theta));
    var y = (radius * Math.cos(phi));
    return new THREE.Vector3(x, y, z);
  }

  // Minimal TopoJSON arc decoder (avoids needing the topojson-client library)
  function decodeTopoArcs(topology) {
    var arcs = topology.arcs;
    var transform = topology.transform;
    var scale = transform ? transform.scale : [1, 1];
    var translate = transform ? transform.translate : [0, 0];
    return arcs.map(function (arc) {
      var x = 0, y = 0;
      return arc.map(function (point) {
        x += point[0];
        y += point[1];
        return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
      });
    });
  }

  function arcToCoords(decodedArcs, arcIndex) {
    var i = arcIndex < 0 ? ~arcIndex : arcIndex;
    var coords = decodedArcs[i].slice();
    if (arcIndex < 0) coords.reverse();
    return coords;
  }

  function ringToCoords(decodedArcs, ring) {
    var coords = [];
    ring.forEach(function (arcIndex, idx) {
      var arcCoords = arcToCoords(decodedArcs, arcIndex);
      if (idx > 0) arcCoords = arcCoords.slice(1);
      coords = coords.concat(arcCoords);
    });
    return coords;
  }

  function buildCountryLines(decodedArcs, geometries) {
    var group = new THREE.Group();
    var material = new THREE.LineBasicMaterial({ color: 0x2f7d94, transparent: true, opacity: 0.85 });

    function addPolygonRings(rings) {
      rings.forEach(function (ring) {
        var coords = ringToCoords(decodedArcs, ring);
        var points = coords.map(function (c) { return latLonToVec3(c[1], c[0], GLOBE_RADIUS + 0.3); });
        var geo = new THREE.BufferGeometry().setFromPoints(points);
        var line = new THREE.Line(geo, material);
        group.add(line);
      });
    }

    geometries.forEach(function (geom) {
      if (geom.type === 'Polygon') {
        addPolygonRings(geom.arcs);
      } else if (geom.type === 'MultiPolygon') {
        geom.arcs.forEach(function (poly) { addPolygonRings(poly); });
      }
    });

    return group;
  }

  // Builds a filled circular cap (in red) centered at lat/lon with the given
  // radius in km, by sampling a ring of points at that great-circle distance
  // and fanning triangles from the center — this is what makes a delivery
  // zone show up as a solid colored disc on the globe rather than a dot.
  function buildDeliveryZoneMesh(lat, lon, radiusKm) {
    var segments = 64;
    var angularRadius = radiusKm / KM_PER_RADIAN; // radians on the sphere

    var centerVec = latLonToVec3(lat, lon, 1).normalize();
    var arbitrary = Math.abs(centerVec.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    var east = new THREE.Vector3().crossVectors(arbitrary, centerVec).normalize();
    var north = new THREE.Vector3().crossVectors(centerVec, east).normalize();

    var ringPoints = [];
    for (var i = 0; i <= segments; i++) {
      var angle = (i / segments) * Math.PI * 2;
      var dir = new THREE.Vector3()
        .addScaledVector(east, Math.cos(angle))
        .addScaledVector(north, Math.sin(angle));
      var point = new THREE.Vector3()
        .addScaledVector(centerVec, Math.cos(angularRadius))
        .addScaledVector(dir, Math.sin(angularRadius))
        .normalize()
        .multiplyScalar(GLOBE_RADIUS + 0.5);
      ringPoints.push(point);
    }

    var centerPoint = centerVec.clone().multiplyScalar(GLOBE_RADIUS + 0.5);

    var positions = [];
    for (var i = 0; i < segments; i++) {
      positions.push(centerPoint.x, centerPoint.y, centerPoint.z);
      positions.push(ringPoints[i].x, ringPoints[i].y, ringPoints[i].z);
      positions.push(ringPoints[i + 1].x, ringPoints[i + 1].y, ringPoints[i + 1].z);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();

    var mat = new THREE.MeshBasicMaterial({ color: 0xff5c6c, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    var mesh = new THREE.Mesh(geo, mat);

    var outlinePositions = [];
    ringPoints.forEach(function (p) { outlinePositions.push(p.x, p.y, p.z); });
    var outlineGeo = new THREE.BufferGeometry();
    outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
    var outlineMat = new THREE.LineBasicMaterial({ color: 0xff8a95 });
    var outline = new THREE.Line(outlineGeo, outlineMat);

    var group = new THREE.Group();
    group.add(mesh);
    group.add(outline);
    return group;
  }

  function initGlobe() {
    var holder = document.getElementById('globe-canvas-holder');
    if (!holder) return;
    var width = holder.clientWidth;
    var height = holder.clientHeight;

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    globeCamera.position.z = zoomDist;

    globeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    globeRenderer.setSize(width, height);
    globeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    holder.appendChild(globeRenderer.domElement);

    globeGroup = new THREE.Group();
    globeScene.add(globeGroup);

    var sphereGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 48, 48);
    var sphereMat = new THREE.MeshBasicMaterial({ color: 0x1f6b3d, transparent: true, opacity: 0.95 });
    var sphere = new THREE.Mesh(sphereGeo, sphereMat);
    globeGroup.add(sphere);

    var wireGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.1, 24, 16);
    var wireMat = new THREE.MeshBasicMaterial({ color: 0x1c3a52, wireframe: true, transparent: true, opacity: 0.3 });
    var wireSphere = new THREE.Mesh(wireGeo, wireMat);
    globeGroup.add(wireSphere);

    var glowGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 4, 32, 32);
    var glowMat = new THREE.MeshBasicMaterial({ color: 0x34e0ff, transparent: true, opacity: 0.045, side: THREE.BackSide });
    var glow = new THREE.Mesh(glowGeo, glowMat);
    globeGroup.add(glow);

    globeGroup.rotation.x = rotX;
    globeGroup.rotation.y = rotY;

    holder.addEventListener('pointerdown', function (e) {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      holder.setPointerCapture(e.pointerId);
    });
    holder.addEventListener('pointermove', function (e) {
      if (!isDragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      rotY += dx * 0.005;
      rotX += dy * 0.005;
      rotX = Math.max(-1.4, Math.min(1.4, rotX));
      globeGroup.rotation.y = rotY;
      globeGroup.rotation.x = rotX;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    holder.addEventListener('pointerup', function (e) {
      isDragging = false;
      try { holder.releasePointerCapture(e.pointerId); } catch (err) {}
    });
    holder.addEventListener('pointerleave', function () { isDragging = false; });
    holder.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomDist += e.deltaY * 0.15;
      zoomDist = Math.max(140, Math.min(500, zoomDist));
      globeCamera.position.z = zoomDist;
    }, { passive: false });

    window.addEventListener('resize', function () {
      var w = holder.clientWidth, h = holder.clientHeight;
      if (!w || !h) return;
      globeCamera.aspect = w / h;
      globeCamera.updateProjectionMatrix();
      globeRenderer.setSize(w, h);
    });

    function animate() {
      requestAnimationFrame(animate);
      if (!isDragging) rotY += 0.0009;
      globeGroup.rotation.y = rotY;
      globeRenderer.render(globeScene, globeCamera);
    }
    animate();

    fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
      .then(function (r) { return r.json(); })
      .then(function (topology) {
        var decodedArcs = decodeTopoArcs(topology);
        var geometries = topology.objects.countries.geometries;
        var lines = buildCountryLines(decodedArcs, geometries);
        globeGroup.add(lines);
        var loadingEl = document.getElementById('globe-loading');
        if (loadingEl) loadingEl.style.display = 'none';
        loadZonesIntoGlobe();
      })
      .catch(function () {
        var loadingEl = document.getElementById('globe-loading');
        if (loadingEl) loadingEl.textContent = 'Could not load world map data.';
        loadZonesIntoGlobe();
      });
  }

  function loadZonesIntoGlobe() {
    api('/api/delivery-regions').then(function (res) {
      var regions = res.data || [];

      if (zoneGroup) globeGroup.remove(zoneGroup);
      zoneGroup = new THREE.Group();

      regions.forEach(function (r) {
        var zone = buildDeliveryZoneMesh(r.lat, r.lon, r.radius_km || 30);
        zoneGroup.add(zone);
      });

      globeGroup.add(zoneGroup);
      renderRegionList(regions);
    });
  }

  function renderRegionList(regions) {
    var listEl = document.getElementById('region-list');
    if (regions.length === 0) {
      listEl.innerHTML = '<div class="empty-msg">No delivery regions set yet.</div>';
      return;
    }
    listEl.innerHTML = regions.map(function (r) {
      return '<div class="region-chip">' + escapeHtml(r.label) +
        '<br><span style="color:var(--text-dim); font-size:0.8rem;">radius ' + r.radius_km + ' km</span></div>';
    }).join('');
  }

  initGlobe();
})();
