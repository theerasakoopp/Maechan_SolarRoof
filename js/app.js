// Top-level stub to prevent any early inline onclick errors
window.setDashboardMode = function(mode) {
    window._pendingMode = mode;
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Mae Chan Solar WebGIS Engine (Dual Mode: GT & AI)...');

    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);

    // 1. Load Datasets & Statistics
    let gtStats = null;
    let compStats = null;
    let currentMode = 'gt'; // 'gt', 'ai', 'compare'


    try {
        const [statsRes, compRes] = await Promise.all([
            fetch(basePath + 'data/maechan_stats.json'),
            fetch(basePath + 'data/maechan_comparison_stats.json')
        ]);
        gtStats = await statsRes.json();
        compStats = await compRes.json();
        
        renderKPIs(gtStats, 'gt');
        renderTierList(gtStats.tiers);
        renderComparisonCard(compStats);
    } catch (err) {
        console.error('Failed to load stats JSON:', err);
    }

    // 2. Active State
    const activeTiers = new Set(['Tier 3', 'Tier 2', 'Tier 1', 'Sub-optimal']);
    let currentTariff = 4.50; // THB / kWh
    let currentCostPerKwp = 32000; // THB / kWp
    let selectedFeatureId = null;
    let selectedLayerSource = null;

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

        // 6. Add Ground Truth Rooftop Facets (10,654 features)
        map.addSource('solar-facets', {
            type: 'geojson',
            data: basePath + 'data/maechan_solar_facets.geojson',
            promoteId: 'fid'
        });

        map.addLayer({
            id: 'layer-facets-fill',
            type: 'fill',
            source: 'solar-facets',
            layout: { visibility: 'visible' },
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'Tier'],
                    'Tier 3', '#f97316',
                    'Tier 2', '#eab308',
                    'Tier 1', '#06b6d4',
                    '#64748b'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false], 0.95,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    0.80
                ]
            }
        });

        map.addLayer({
            id: 'layer-facets-stroke',
            type: 'line',
            source: 'solar-facets',
            layout: { visibility: 'visible' },
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

        // 7. Add AI Predicted Rooftop Facets (6,642 features from Stage 05 Vectorization)
        map.addSource('ai-facets', {
            type: 'geojson',
            data: basePath + 'data/maechan_ai_facets.geojson',
            promoteId: 'id'
        });

        map.addLayer({
            id: 'layer-ai-facets-fill',
            type: 'fill',
            source: 'ai-facets',
            layout: { visibility: 'none' },
            paint: {
                'fill-color': [
                    'match',
                    ['get', 'tier'],
                    'Tier 3', '#f97316',
                    'Tier 2', '#eab308',
                    'Tier 1', '#06b6d4',
                    '#64748b'
                ],
                'fill-opacity': [
                    'case',
                    ['boolean', ['feature-state', 'hover'], false], 0.95,
                    ['boolean', ['feature-state', 'selected'], false], 1.0,
                    0.80
                ]
            }
        });

        map.addLayer({
            id: 'layer-ai-facets-stroke',
            type: 'line',
            source: 'ai-facets',
            layout: { visibility: 'none' },
            paint: {
                'line-color': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], '#ffffff',
                    'rgba(56, 189, 248, 0.6)'
                ],
                'line-width': [
                    'case',
                    ['boolean', ['feature-state', 'selected'], false], 2.5,
                    0.9
                ]
            }
        });

        // 8. Add AI Building Footprints (1,569 features)
        map.addSource('ai-buildings', {
            type: 'geojson',
            data: basePath + 'data/maechan_ai_buildings.geojson'
        });

        map.addLayer({
            id: 'layer-ai-buildings-line',
            type: 'line',
            source: 'ai-buildings',
            layout: { visibility: 'none' },
            paint: {
                'line-color': '#f43f5e',
                'line-width': 1.8,
                'line-dasharray': [2, 1]
            }
        });

        // 9. Interactive Hover & Clicks for Both Layers
        setupMapInteractions(map);
    });

    // ── Interaction Handlers ──
    let hoveredStateId = null;
    let hoveredSource = null;
    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '340px'
    });

    function setupMapInteractions(map) {
        const layers = [
            { fill: 'layer-facets-fill', source: 'solar-facets', type: 'gt' },
            { fill: 'layer-ai-facets-fill', source: 'ai-facets', type: 'ai' }
        ];

        layers.forEach(({ fill, source, type }) => {
            map.on('mousemove', fill, (e) => {
                if (e.features.length > 0) {
                    map.getCanvas().style.cursor = 'pointer';
                    if (hoveredStateId !== null && hoveredSource !== null) {
                        map.setFeatureState({ source: hoveredSource, id: hoveredStateId }, { hover: false });
                    }
                    hoveredStateId = e.features[0].id;
                    hoveredSource = source;
                    map.setFeatureState({ source: hoveredSource, id: hoveredStateId }, { hover: true });
                }
            });

            map.on('mouseleave', fill, () => {
                map.getCanvas().style.cursor = '';
                if (hoveredStateId !== null && hoveredSource !== null) {
                    map.setFeatureState({ source: hoveredSource, id: hoveredStateId }, { hover: false });
                }
                hoveredStateId = null;
                hoveredSource = null;
            });

            map.on('click', fill, (e) => {
                if (!e.features.length) return;
                const feat = e.features[0];
                const props = feat.properties;

                if (selectedFeatureId !== null && selectedLayerSource !== null) {
                    map.setFeatureState({ source: selectedLayerSource, id: selectedFeatureId }, { selected: false });
                }
                selectedFeatureId = feat.id;
                selectedLayerSource = source;
                map.setFeatureState({ source: selectedLayerSource, id: selectedFeatureId }, { selected: true });

                showFacetPopup(props, type, e.lngLat);
            });
        });
    }

    function showFacetPopup(props, type, lngLat) {
        const isAI = (type === 'ai');
        const cap_kw = parseFloat(isAI ? props.capacity_kwp : props.cap_kw) || 0;
        const annual_kwh = parseFloat(isAI ? (props.energy_corrected_kwh || props.energy_kwh) : props.annual_kwh) || 0;
        const annual_thb = annual_kwh * currentTariff;
        const estimated_invest = cap_kw * currentCostPerKwp;
        const payback_yrs = annual_thb > 0 ? (estimated_invest / annual_thb).toFixed(1) : 'N/A';
        const co2_ton = (annual_kwh * 0.0005).toFixed(2);

        const tierName = isAI ? props.tier : props.Tier;
        const tierColor = isAI ? props.tier_color : (props.color || '#f97316');
        const orientLabel = isAI ? (props.orientation_th || props.class_name) : props.orientation;
        const area2d = isAI ? props.area_2d : props.roofarea;
        const areaUsable = isAI ? props.area_usable : props.usable_area;
        const titleBadge = isAI ? '🤖 AI Deep Learning (Stage 05)' : '🏢 Ground Truth Cadastral Survey';

        const popupHtml = `
            <div style="font-family: 'Inter', sans-serif;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: ${isAI ? '#38bdf8' : '#10b981'}; text-transform: uppercase;">
                        ${titleBadge}
                    </span>
                    <span style="background: ${tierColor}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">
                        ${tierName}
                    </span>
                </div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 10px;">
                    ${orientLabel}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.76rem; background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                    <div><span style="color:#94a3b8;">พื้นที่ 2D:</span> <b style="color:#fff;">${area2d} m²</b></div>
                    <div><span style="color:#94a3b8;">พื้นที่ติดตั้งจริง:</span> <b style="color:#fff;">${areaUsable} m²</b></div>
                    <div><span style="color:#94a3b8;">กำลังผลิต (PV):</span> <b style="color:#f97316; font-family: 'JetBrains Mono';">${cap_kw.toFixed(1)} kWp</b></div>
                    <div><span style="color:#94a3b8;">ผลผลิตต่อปี:</span> <b style="color:#eab308; font-family: 'JetBrains Mono';">${Math.round(annual_kwh).toLocaleString()} kWh</b></div>
                    <div><span style="color:#94a3b8;">ประหยัดค่าไฟ:</span> <b style="color:#10b981; font-family: 'JetBrains Mono';">${Math.round(annual_thb).toLocaleString()} ฿/y</b></div>
                    <div><span style="color:#94a3b8;">ระยะคืนทุน:</span> <b style="color:#38bdf8; font-family: 'JetBrains Mono';">${payback_yrs} ปี</b></div>
                </div>
                ${isAI && props.slope_deg !== undefined ? `
                <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.7rem; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
                    <span>ความลาดชัน: <b style="color:#fff;">${props.slope_deg}°</b></span>
                    <span>ทิศทาง: <b style="color:#fff;">${props.aspect_deg}°</b></span>
                    <span>f_az: <b style="color:#eab308;">${props.solar_correction || 1.0}</b></span>
                </div>` : ''}
                <div style="margin-top: 8px; font-size: 0.72rem; color: #10b981; display: flex; align-items: center; gap: 4px;">
                    🌱 ลดการปล่อยก๊าซเรือนกระจก: <b>${co2_ton} tCO₂e/ปี</b>
                </div>
            </div>
        `;

        popup.setLngLat(lngLat).setHTML(popupHtml).addTo(map);
    }

    // ── Mode Switcher Engine ──
    window.setDashboardMode = function(mode) {
        currentMode = mode;
        console.log(`Switched to Mode: ${mode}`);

        // Update button states
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        if (mode === 'gt') document.getElementById('btn-mode-gt')?.classList.add('active');
        if (mode === 'ai') document.getElementById('btn-mode-ai')?.classList.add('active');
        if (mode === 'compare') document.getElementById('btn-mode-comp')?.classList.add('active');

        // Checkboxes in Layer Panel
        const chkGt = document.getElementById('chk-gt-facets');
        const chkAi = document.getElementById('chk-ai-facets');
        const chkBld = document.getElementById('chk-ai-buildings');

        const compContainer = document.getElementById('comparison-container');

        if (mode === 'gt') {
            map.setLayoutProperty('layer-facets-fill', 'visibility', 'visible');
            map.setLayoutProperty('layer-facets-stroke', 'visibility', 'visible');
            map.setLayoutProperty('layer-ai-facets-fill', 'visibility', 'none');
            map.setLayoutProperty('layer-ai-facets-stroke', 'visibility', 'none');
            map.setLayoutProperty('layer-ai-buildings-line', 'visibility', 'none');

            if (chkGt) chkGt.checked = true;
            if (chkAi) chkAi.checked = false;
            if (chkBld) chkBld.checked = false;

            if (compContainer) compContainer.style.display = 'none';
            if (gtStats) {
                renderKPIs(gtStats, 'gt');
                renderTierList(gtStats.tiers);
            }
        } else if (mode === 'ai') {
            map.setLayoutProperty('layer-facets-fill', 'visibility', 'none');
            map.setLayoutProperty('layer-facets-stroke', 'visibility', 'none');
            map.setLayoutProperty('layer-ai-facets-fill', 'visibility', 'visible');
            map.setLayoutProperty('layer-ai-facets-stroke', 'visibility', 'visible');
            map.setLayoutProperty('layer-ai-buildings-line', 'visibility', 'visible');

            if (chkGt) chkGt.checked = false;
            if (chkAi) chkAi.checked = true;
            if (chkBld) chkBld.checked = true;

            if (compContainer) compContainer.style.display = 'none';
            if (compStats && compStats.ai_prediction) {
                renderKPIs(compStats.ai_prediction, 'ai');
                renderTierList(compStats.ai_prediction.tiers);
            }
        } else if (mode === 'compare') {
            // Show both layers
            map.setLayoutProperty('layer-facets-fill', 'visibility', 'none');
            map.setLayoutProperty('layer-facets-stroke', 'visibility', 'visible'); // Outline of survey
            map.setLayoutProperty('layer-ai-facets-fill', 'visibility', 'visible'); // Fill of AI
            map.setLayoutProperty('layer-ai-facets-stroke', 'visibility', 'visible');
            map.setLayoutProperty('layer-ai-buildings-line', 'visibility', 'visible');

            if (chkGt) chkGt.checked = true;
            if (chkAi) chkAi.checked = true;
            if (chkBld) chkBld.checked = true;

            if (compContainer) compContainer.style.display = 'block';
            if (compStats) {
                renderKPIs(compStats.ai_prediction, 'compare');
                renderTierList(compStats.ai_prediction.tiers);
            }
        }
    };

    // Attach explicit click listeners to buttons
    document.getElementById('btn-mode-gt')?.addEventListener('click', () => window.setDashboardMode('gt'));
    document.getElementById('btn-mode-ai')?.addEventListener('click', () => window.setDashboardMode('ai'));
    document.getElementById('btn-mode-comp')?.addEventListener('click', () => window.setDashboardMode('compare'));

    // Check if any mode was clicked before initialization completed
    if (window._pendingMode) {
        window.setDashboardMode(window._pendingMode);
        window._pendingMode = null;
    }


    // ── Tier Filter Controls ──
    window.toggleTier = function(tierName) {
        if (activeTiers.has(tierName)) {
            if (activeTiers.size === 1) return;
            activeTiers.delete(tierName);
        } else {
            activeTiers.add(tierName);
        }

        document.querySelectorAll('.tier-item').forEach(el => {
            const t = el.dataset.tier;
            if (activeTiers.has(t)) el.classList.add('active');
            else el.classList.remove('active');
        });

        const filterGt = ['match', ['get', 'Tier'], Array.from(activeTiers), true, false];
        const filterAi = ['match', ['get', 'tier'], Array.from(activeTiers), true, false];

        if (map.getLayer('layer-facets-fill')) map.setFilter('layer-facets-fill', filterGt);
        if (map.getLayer('layer-facets-stroke')) map.setFilter('layer-facets-stroke', filterGt);
        if (map.getLayer('layer-ai-facets-fill')) map.setFilter('layer-ai-facets-fill', filterAi);
        if (map.getLayer('layer-ai-facets-stroke')) map.setFilter('layer-ai-facets-stroke', filterAi);
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
        map.setLayoutProperty('layer-uav-10cm', 'visibility', checkbox.checked ? 'visible' : 'none');
    };

    window.toggleGtFacetsLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-facets-fill', 'visibility', vis);
        map.setLayoutProperty('layer-facets-stroke', 'visibility', vis);
    };

    window.toggleAiFacetsLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-ai-facets-fill', 'visibility', vis);
        map.setLayoutProperty('layer-ai-facets-stroke', 'visibility', vis);
    };

    window.toggleAiBuildingsLayer = function(checkbox) {
        map.setLayoutProperty('layer-ai-buildings-line', 'visibility', checkbox.checked ? 'visible' : 'none');
    };

    window.toggleAdminLayer = function(checkbox) {
        map.setLayoutProperty('layer-admin-outline', 'visibility', checkbox.checked ? 'visible' : 'none');
    };

    window.toggleLayerPanel = function() {
        document.getElementById('layer-panel').classList.toggle('open');
    };

    window.toggleSidebar = function() {
        document.getElementById('sidebar').classList.toggle('collapsed');
    };

    // ── Tariff & Investment Simulator ──
    window.updateTariff = function(val) {
        currentTariff = parseFloat(val);
        document.getElementById('tariff-val').textContent = currentTariff.toFixed(2) + ' ฿';
        const activeData = (currentMode === 'ai' || currentMode === 'compare') && compStats ? compStats.ai_prediction : gtStats;
        if (activeData) {
            const gen = activeData.total_generation_gwh_yr || 78.32;
            const newTotalSavings = (gen * 1e6 * currentTariff / 1e6).toFixed(2);
            document.getElementById('kpi-savings').textContent = newTotalSavings;
        }
    };

    window.updateCostPerKwp = function(val) {
        currentCostPerKwp = parseInt(val);
        document.getElementById('cost-val').textContent = currentCostPerKwp.toLocaleString() + ' ฿';
    };

    // ── Render Dynamic UI Data ──
    function renderKPIs(stats, mode) {
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
            { key: 'Tier 3', name: 'Tier 3 (>15 kWp)', desc: 'อาคารพาณิชย์และหลังคาขนาดใหญ่' },
            { key: 'Tier 2', name: 'Tier 2 (5–15 kWp)', desc: 'อาคารขนาดกลางและบ้านพักอาศัย' },
            { key: 'Tier 1', name: 'Tier 1 (2.5–5 kWp)', desc: 'ทาวน์เฮาส์และโซลาร์ขนาดเล็ก' },
            { key: 'Sub-optimal', name: 'Sub-optimal (<2.5 kWp)', desc: 'หลังคาส่วนต่อเติมขนาดเล็ก' }
        ];

        tierMeta.forEach(m => {
            const data = tiers[m.key];
            if (!data) return;
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
                    <div class="tier-count">${data.count.toLocaleString()} ระนาบ (${data.pct_count}%)</div>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderComparisonCard(comp) {
        const container = document.getElementById('comparison-container');
        if (!container || !comp) return;

        const gt = comp.ground_truth;
        const ai = comp.ai_prediction;
        const diff = comp.metrics_diff;

        container.innerHTML = `
            <div class="comparison-card">
                <div class="comparison-header">
                    <span>📊 ตารางเปรียบเทียบสถิติเชิงประจักษ์ (Empirical Matrix)</span>
                </div>
                <table class="comp-table">
                    <thead>
                        <tr>
                            <th>ดัชนีชี้วัด (Metric)</th>
                            <th style="text-align:right;">สำรวจจริง (GT)</th>
                            <th style="text-align:right;">ทำนาย AI</th>
                            <th style="text-align:right;">Recovery %</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><b>จำนวนระนาบ (Facets)</b></td>
                            <td class="num">${gt.total_facets.toLocaleString()}</td>
                            <td class="num" style="color: #38bdf8;">${ai.total_facets.toLocaleString()}</td>
                            <td class="num"><span class="comp-badge mid">${diff.facet_count_pct_ratio}%</span></td>
                        </tr>
                        <tr>
                            <td><b>กำลังผลิต (MWp)</b></td>
                            <td class="num">${gt.total_capacity_mwp.toFixed(2)}</td>
                            <td class="num" style="color: #f97316;">${ai.total_capacity_mwp.toFixed(2)}</td>
                            <td class="num"><span class="comp-badge high">${diff.capacity_pct_ratio}%</span></td>
                        </tr>
                        <tr>
                            <td><b>ผลผลิตไฟฟ้า (GWh/y)</b></td>
                            <td class="num">${gt.total_generation_gwh_yr.toFixed(2)}</td>
                            <td class="num" style="color: #eab308;">${ai.total_generation_gwh_yr.toFixed(2)}</td>
                            <td class="num"><span class="comp-badge high">${diff.generation_pct_ratio}%</span></td>
                        </tr>
                        <tr>
                            <td><b>ประหยัดค่าไฟ (ล้าน฿/ปี)</b></td>
                            <td class="num">${gt.total_bill_savings_thb_m_yr.toFixed(2)}</td>
                            <td class="num" style="color: #10b981;">${ai.total_bill_savings_thb_m_yr.toFixed(2)}</td>
                            <td class="num"><span class="comp-badge high">${diff.generation_pct_ratio}%</span></td>
                        </tr>
                        <tr>
                            <td><b>ลดก๊าซเรือนกระจก (ตัน)</b></td>
                            <td class="num">${gt.total_co2_offset_tons_yr.toLocaleString()}</td>
                            <td class="num" style="color: #38bdf8;">${ai.total_co2_offset_tons_yr.toLocaleString()}</td>
                            <td class="num"><span class="comp-badge high">${diff.generation_pct_ratio}%</span></td>
                        </tr>
                    </tbody>
                </table>
                <div style="font-size: 0.7rem; color: #94a3b8; line-height: 1.4; background: rgba(0,0,0,0.3); padding: 8px; border-radius: 6px;">
                    🎯 <b>ผลการวิเคราะห์ GeoAI:</b> โมเดล AI สามารถกู้คืนศักยภาพพลังงานติดตั้งได้ถึง <b>${diff.capacity_pct_ratio}% (53.00 จาก 60.83 MWp)</b> โดยมีจำนวนระนาบที่กระชับและรวมระนาบเล็กที่มีความต่อเนื่องเชิงพื้นที่ ส่งผลให้การจัดวางแผงเป็นไปได้จริงทางวิศวกรรม
                </div>
            </div>
        `;
    }
});
