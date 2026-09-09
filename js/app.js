/**
 * Mae Chan Rooftop Solar Potential WebGIS Dashboard
 * MapLibre GL JS + GeoAI Spatial Analytics Engine
 */

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Mae Chan Solar WebGIS Engine...');

    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    // 1. Load Municipal Statistics
    let statsData = null;
    try {
        const statsRes = await fetch(basePath + 'data/maechan_stats.json');
        statsData = await statsRes.json();
        renderKPIs(statsData);
        renderTierList(statsData.tiers);
    } catch (err) {
        console.error('Failed to load stats JSON:', err);
    }

    // 2. Active Tier Filters State
    const activeTiers = new Set(['Tier 3', 'Tier 2', 'Tier 1', 'Sub-optimal']);
    let currentTariff = 4.50; // THB / kWh
    let currentCostPerKwp = 32000; // THB / kWp
    let selectedFeatureId = null;

    // 3. Initialize MapLibre GL Map
    const map = new maplibregl.Map({
        container: 'map',
        style: {
            version: 8,
            sources: {
                'carto-dark': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
                },
                'esri-satellite': {
                    type: 'raster',
                    tiles: [
                        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                    ],
                    tileSize: 256,
                    attribution: '&copy; ESRI World Imagery'
                },
                'osm-standard': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; OpenStreetMap'
                }
            },
            layers: [
                {
                    id: 'base-carto',
                    type: 'raster',
                    source: 'carto-dark',
                    layout: { visibility: 'visible' }
                },
                {
                    id: 'base-satellite',
                    type: 'raster',
                    source: 'esri-satellite',
                    layout: { visibility: 'none' }
                },
                {
                    id: 'base-osm',
                    type: 'raster',
                    source: 'osm-standard',
                    layout: { visibility: 'none' }
                }
            ]
        },
        center: [99.8589, 20.1460], // Mae Chan Municipality Center
        zoom: 15.8,
        minZoom: 13,
        maxZoom: 21,
        pitch: 25,
        bearing: 0
    });

    // Add navigation and scale controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-right');

    map.on('load', () => {
        console.log('🗺️ MapLibre Map Loaded. Adding Layers...');

        // 4. Add 10 cm UAV Orthophoto Tile Layer
        const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        map.addSource('uav-tiles-10cm', {
            type: 'raster',
            tiles: [basePath + 'tiles/uav/{z}/{x}/{y}.webp'],
            tileSize: 256,
            minzoom: 14,
            maxzoom: 20,
            bounds: [99.850, 20.125, 99.870, 20.165]
        });

        map.addLayer({
            id: 'layer-uav-10cm',
            type: 'raster',
            source: 'uav-tiles-10cm',
            layout: { visibility: 'visible' },
            paint: { 'raster-opacity': 0.95 }
        });

        // 5. Add Mae Chan Municipal Administrative Boundary
        map.addSource('maechan-admin', {
            type: 'geojson',
            data: basePath + 'data/maechan_boundary.geojson'
        });

        map.addLayer({
            id: 'layer-admin-outline',
            type: 'line',
            source: 'maechan-admin',
            paint: {
                'line-color': '#10b981',
                'line-width': 2.5,
                'line-dasharray': [3, 1.5]
            }
        });

        // 6. Add Solar Rooftop Facets Vector Layer (10,654 facets)
        map.addSource('solar-facets', {
            type: 'geojson',
            data: basePath + 'data/maechan_solar_facets.geojson',
            promoteId: 'fid'
        });

        // Polygon Fill
        map.addLayer({
            id: 'layer-facets-fill',
            type: 'fill',
            source: 'solar-facets',
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'Tier'],
                    'Tier 3', '#f97316',
                    'Tier 2', '#eab308',
                    'Tier 1', '#06b6d4',
                    '#64748b' // Sub-optimal fallback
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false], 0.95,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    0.80
                ]
            }
        });

        // Polygon Border Strokes
        map.addLayer({
            id: 'layer-facets-stroke',
            type: 'line',
            source: 'solar-facets',
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#ffffff',
                    'rgba(255, 255, 255, 0.4)'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.5,
                    0.8
                ]
            }
        });

        // 7. Interactive Hover Tooltips & Clicks
        setupMapInteractions(map);
    });

    // ── Interaction Handlers ──
    let hoveredStateId = null;
    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '320px'
    });

    function setupMapInteractions(map) {
        // Hover effects
        map.on('mousemove', 'layer-facets-fill', (e) => {
            if (e.features.length > 0) {
                map.getCanvas().style.cursor = 'pointer';
                if (hoveredStateId !== null) {
                    map.setFeatureState({ source: 'solar-facets', id: hoveredStateId }, { hover: false });
                }
                hoveredStateId = e.features[0].id;
                map.setFeatureState({ source: 'solar-facets', id: hoveredStateId }, { hover: true });
            }
        });

        map.on('mouseleave', 'layer-facets-fill', () => {
            map.getCanvas().style.cursor = '';
            if (hoveredStateId !== null) {
                map.setFeatureState({ source: 'solar-facets', id: hoveredStateId }, { hover: false });
            }
            hoveredStateId = null;
        });

        // Click Inspection
        map.on('click', 'layer-facets-fill', (e) => {
            if (!e.features.length) return;
            const feat = e.features[0];
            const props = feat.properties;

            // Update selected state
            if (selectedFeatureId !== null) {
                map.setFeatureState({ source: 'solar-facets', id: selectedFeatureId }, { selected: false });
            }
            selectedFeatureId = feat.id;
            map.setFeatureState({ source: 'solar-facets', id: selectedFeatureId }, { selected: true });

            // Dynamic calculation with current tariff & installation cost
            const cap_kw = parseFloat(props.cap_kw);
            const annual_kwh = parseFloat(props.annual_kwh);
            const annual_thb = annual_kwh * currentTariff;
            const estimated_invest = cap_kw * currentCostPerKwp;
            const payback_yrs = annual_thb > 0 ? (estimated_invest / annual_thb).toFixed(1) : 'N/A';
            const co2_ton = (annual_kwh * 0.4999 / 1000).toFixed(2);

            const tierColor = props.color || '#f97316';

            const popupHtml = `
                <div style="font-family: 'Inter', sans-serif;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase;">FACET #${props.fid}</span>
                        <span style="background: ${tierColor}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">${props.Tier}</span>
                    </div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #fff; margin-bottom: 12px;">
                        ${props.orientation}
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.78rem; background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div><span style="color:#94a3b8;">พื้นที่หลังคา:</span> <b style="color:#fff;">${props.roofarea} m²</b></div>
                        <div><span style="color:#94a3b8;">พื้นที่ติดตั้ง:</span> <b style="color:#fff;">${props.usable_area} m²</b></div>
                        <div><span style="color:#94a3b8;">ขนาดระบบ PV:</span> <b style="color:#f97316; font-family: 'JetBrains Mono';">${cap_kw} kWp</b></div>
                        <div><span style="color:#94a3b8;">ผลผลิตพลังงาน:</span> <b style="color:#eab308; font-family: 'JetBrains Mono';">${annual_kwh.toLocaleString()} kWh/y</b></div>
                        <div><span style="color:#94a3b8;">ประหยัดค่าไฟ:</span> <b style="color:#10b981; font-family: 'JetBrains Mono';">${Math.round(annual_thb).toLocaleString()} ฿/y</b></div>
                        <div><span style="color:#94a3b8;">ระยะคืนทุน:</span> <b style="color:#38bdf8; font-family: 'JetBrains Mono';">${payback_yrs} ปี</b></div>
                    </div>
                    <div style="margin-top: 10px; font-size: 0.72rem; color: #10b981; display: flex; align-items: center; gap: 4px;">
                        🌱 ลดการปล่อยคาร์บอน: <b>${co2_ton} ตัน CO₂/ปี</b>
                    </div>
                </div>
            `;

            popup.setLngLat(e.lngLat).setHTML(popupHtml).addTo(map);
        });
    }

    // ── Tier Filter Controls ──
    window.toggleTier = function(tierName) {
        if (activeTiers.has(tierName)) {
            if (activeTiers.size === 1) return; // keep at least one
            activeTiers.delete(tierName);
        } else {
            activeTiers.add(tierName);
        }

        // Update UI element state
        document.querySelectorAll('.tier-item').forEach(el => {
            const t = el.dataset.tier;
            if (activeTiers.has(t)) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        // Apply Map Filter
        const filterArray = ['match', ['get', 'Tier'], Array.from(activeTiers), true, false];
        map.setFilter('layer-facets-fill', filterArray);
        map.setFilter('layer-facets-stroke', filterArray);
    };

    // ── Basemap & Layer Switching ──
    window.switchBasemap = function(baseId) {
        ['base-carto', 'base-satellite', 'base-osm'].forEach(id => {
            map.setLayoutProperty(id, 'visibility', id === baseId ? 'visible' : 'none');
        });
        document.querySelectorAll('.base-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.base === baseId);
        });
    };

    window.toggleUavLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-uav-10cm', 'visibility', vis);
    };

    window.toggleFacetsLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-facets-fill', 'visibility', vis);
        map.setLayoutProperty('layer-facets-stroke', 'visibility', vis);
    };

    window.toggleAdminLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-admin-outline', 'visibility', vis);
    };

    window.toggleLayerPanel = function() {
        const panel = document.getElementById('layer-panel');
        panel.classList.toggle('open');
    };

    window.toggleSidebar = function() {
        const sb = document.getElementById('sidebar');
        sb.classList.toggle('collapsed');
    };

    // ── Tariff & Investment Simulator ──
    window.updateTariff = function(val) {
        currentTariff = parseFloat(val);
        document.getElementById('tariff-val').textContent = currentTariff.toFixed(2) + ' ฿';
        if (statsData) {
            const newTotalSavings = (statsData.total_generation_gwh_yr * 1e6 * currentTariff / 1e6).toFixed(2);
            document.getElementById('kpi-savings').textContent = newTotalSavings;
        }
    };

    window.updateCostPerKwp = function(val) {
        currentCostPerKwp = parseInt(val);
        document.getElementById('cost-val').textContent = currentCostPerKwp.toLocaleString() + ' ฿';
    };

    // ── Render Dynamic UI Data ──
    function renderKPIs(stats) {
        document.getElementById('kpi-facets').textContent = stats.total_facets.toLocaleString();
        document.getElementById('kpi-capacity').textContent = stats.total_capacity_mwp.toFixed(2);
        document.getElementById('kpi-generation').textContent = stats.total_generation_gwh_yr.toFixed(2);
        document.getElementById('kpi-savings').textContent = stats.total_bill_savings_thb_m_yr.toFixed(2);
        document.getElementById('kpi-co2').textContent = stats.total_co2_offset_tons_yr.toLocaleString();
    }

    function renderTierList(tiers) {
        const container = document.getElementById('tier-list-container');
        if (!container) return;
        container.innerHTML = '';

        const tierMeta = [
            { key: 'Tier 3', name: 'Tier 3 (>5 kWp)', desc: 'อาคารพาณิชย์และหลังคาขนาดใหญ่' },
            { key: 'Tier 2', name: 'Tier 2 (3–5 kWp)', desc: 'บ้านพักอาศัยมาตรฐานทั่วไป' },
            { key: 'Tier 1', name: 'Tier 1 (1.5–3 kWp)', desc: 'ทาวน์เฮาส์และโซลาร์ขนาดเล็ก' },
            { key: 'Sub-optimal', name: 'Sub-optimal (<1.5 kWp)', desc: 'หลังคาส่วนต่อเติมขนาดเล็ก' }
        ];

        tierMeta.forEach(m => {
            const data = tiers[m.key];
            const div = document.createElement('div');
            div.className = 'tier-item active';
            div.dataset.tier = m.key;
            div.onclick = () => window.toggleTier(m.key);

            div.innerHTML = `
                <div class="tier-left">
                    <div class="tier-badge" style="background: ${data.color};"></div>
                    <div>
                        <div class="tier-name">${m.name}</div>
                        <div class="tier-desc">${m.desc}</div>
                    </div>
                </div>
                <div class="tier-right">
                    <div class="tier-mwp">${data.cap_mwp} MWp</div>
                    <div class="tier-count">${data.count.toLocaleString()} หลัง (${data.pct_mwp}%)</div>
                </div>
            `;
            container.appendChild(div);
        });
    }
});
