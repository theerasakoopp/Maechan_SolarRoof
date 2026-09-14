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
                'carto-light': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
                        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
                    ],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
                },
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
                    id: 'base-light',
                    type: 'raster',
                    source: 'carto-light',
                    layout: { visibility: 'visible' }
                },
                {
                    id: 'base-carto',
                    type: 'raster',
                    source: 'carto-dark',
                    layout: { visibility: 'none' }
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
                    'case',
                    ['has', 'tier_color'], ['get', 'tier_color'],
                    ['has', 'energy_color'], ['get', 'energy_color'],
                    ['has', 'orientation_color'], ['get', 'orientation_color'],
                    ['match', ['get', 'tier'],
                        'Tier 3', '#f97316',
                        'Tier 2', '#eab308',
                        'Tier 1', '#06b6d4',
                        '#64748b'
                    ]
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

        // 8. Add AI Building Footprints & 3D Extrusion (1,525 features)
        map.addSource('ai-buildings', {
            type: 'geojson',
            data: basePath + 'data/maechan_ai_buildings.geojson'
        });

        // 3D Extruded Buildings (CityGML LoD1 using Eave Height from Lowest Facet)
        map.addLayer({
            id: 'layer-ai-buildings-3d',
            type: 'fill-extrusion',
            source: 'ai-buildings',
            layout: { visibility: 'none' },
            paint: {
                'fill-extrusion-color': [
                    'case',
                    ['has', 'tier_color'], ['get', 'tier_color'],
                    ['has', 'energy_color'], ['get', 'energy_color'],
                    '#38bdf8'
                ],
                'fill-extrusion-height': [
                    'coalesce',
                    ['get', 'height_eave'],
                    ['get', 'height_mean'],
                    3.5
                ],
                'fill-extrusion-base': 0,
                'fill-extrusion-opacity': 0.88
            }
        });

        // 3D Extruded Individual Roof Facets (Separated Facet Visualization)
        map.addLayer({
            id: 'layer-ai-facets-3d',
            type: 'fill-extrusion',
            source: 'ai-facets',
            layout: { visibility: 'none' },
            paint: {
                'fill-extrusion-color': [
                    'case',
                    ['has', 'tier_color'], ['get', 'tier_color'],
                    ['has', 'energy_color'], ['get', 'energy_color'],
                    ['has', 'orientation_color'], ['get', 'orientation_color'],
                    ['has', 'color'], ['get', 'color'],
                    '#eab308'
                ],
                'fill-extrusion-height': [
                    'coalesce',
                    ['get', 'height_roof'],
                    ['get', 'height_ridge'],
                    5.5
                ],
                'fill-extrusion-base': [
                    'coalesce',
                    ['get', 'height_base'],
                    ['get', 'height_eave'],
                    3.2
                ],
                'fill-extrusion-opacity': 0.95
            }
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

        // Auto-activate 3D mode if requested via URL hash (#3d) or query (?mode=3d)
        const urlParams = new URLSearchParams(window.location.search);
        if (window.location.hash === '#3d' || urlParams.get('mode') === '3d') {
            setTimeout(() => {
                if (!is3DMode) window.toggle3DCity();
            }, 600);
        }
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

        // 3D Building Extrusion Interactions
        map.on('mousemove', 'layer-ai-buildings-3d', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'layer-ai-buildings-3d', () => {
            map.getCanvas().style.cursor = '';
        });

        map.on('click', 'layer-ai-buildings-3d', (e) => {
            if (!e.features.length) return;
            showBuildingPopup(e.features[0].properties, e.lngLat);
        });

        // 3D Facet Extrusion Interactions
        map.on('mousemove', 'layer-ai-facets-3d', () => {
            map.getCanvas().style.cursor = 'pointer';
        });

        map.on('mouseleave', 'layer-ai-facets-3d', () => {
            map.getCanvas().style.cursor = '';
        });

        map.on('click', 'layer-ai-facets-3d', (e) => {
            if (!e.features.length) return;
            showFacetPopup(e.features[0].properties, 'ai', e.lngLat);
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

        // Accurate 2D vs 3D Area calculations
        const area2d = parseFloat(isAI ? props.area_2d : props.roofarea) || 0;
        let area3d = parseFloat(props.area_3d);
        if (!area3d || isNaN(area3d)) {
            const slope = parseFloat(props.slope_deg) || 0;
            area3d = slope > 0 ? (area2d / Math.cos(slope * Math.PI / 180)) : area2d;
        }
        const areaUsable = parseFloat(isAI ? props.area_usable : props.usable_area) || 0;
        const kUsablePct = isAI ? (props.k_usable ? Math.round(props.k_usable * 100) : (props.class_id === 5 ? 50 : 60)) : 60;
        const titleBadge = isAI ? '🤖 แบบจำลอง GeoAI (SolarNet)' : '🏢 ข้อมูลสำรวจผังเมือง (Ground Truth)';

        const popupHtml = `
            <div style="font-family: 'Inter', sans-serif; min-width: 290px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: ${isAI ? '#38bdf8' : '#10b981'}; text-transform: uppercase;">
                        ${titleBadge}
                    </span>
                    <span style="background: ${tierColor}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">
                        ${tierName}
                    </span>
                </div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 8px;">
                    ${orientLabel}
                </div>

                <!-- Section 1: 3D Physical Surface Dimensions -->
                <div style="background: rgba(15, 23, 42, 0.6); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.25); margin-bottom: 8px;">
                    <div style="font-size: 0.68rem; font-weight: 700; color: #38bdf8; margin-bottom: 4px; display: flex; justify-content: space-between;">
                        <span>📐 มิติพื้นที่ระนาบ 3 มิติ (3D Spatial Geometry)</span>
                        <span style="color: #94a3b8; font-size: 0.64rem;">ชดเชย Slope / cos(β)</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 0.73rem;">
                        <div><span style="color:#94a3b8;">พื้นที่แนวราบ 2D:</span> <b style="color:#cbd5e1;">${area2d.toFixed(1)} m²</b></div>
                        <div><span style="color:#94a3b8;">พื้นที่จริง 3D:</span> <b style="color:#f59e0b; font-family: 'JetBrains Mono';">${area3d.toFixed(1)} m²</b></div>
                        <div style="grid-column: span 2; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 4px; margin-top: 2px;">
                            <span style="color:#94a3b8;">พื้นที่ติดตั้งจริง 3D สุทธิ:</span> 
                            <b style="color:#10b981; font-family: 'JetBrains Mono'; font-size: 0.8rem;">${areaUsable.toFixed(1)} m²</b>
                            <span style="color:#64748b; font-size: 0.65rem;">(หักระยะร่น ${kUsablePct}%)</span>
                        </div>
                    </div>
                </div>

                <!-- Section 2: Energy & Solar Potential (Derived from 3D Area) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem; background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                    <div><span style="color:#94a3b8;">กำลังผลิต (คิดจาก 3D):</span> <b style="color:#f97316; font-family: 'JetBrains Mono';">${cap_kw.toFixed(1)} kWp</b></div>
                    <div><span style="color:#94a3b8;">ผลผลิตไฟฟ้า (จาก 3D):</span> <b style="color:#eab308; font-family: 'JetBrains Mono';">${Math.round(annual_kwh).toLocaleString()} kWh/ปี</b></div>
                    <div><span style="color:#94a3b8;">ประหยัดค่าไฟ:</span> <b style="color:#10b981; font-family: 'JetBrains Mono';">${Math.round(annual_thb).toLocaleString()} ฿/y</b></div>
                    <div><span style="color:#94a3b8;">ระยะคืนทุน:</span> <b style="color:#38bdf8; font-family: 'JetBrains Mono';">${payback_yrs} ปี</b></div>
                </div>

                <!-- Section 3: Slope, Aspect & Solar Azimuth -->
                ${isAI && props.slope_deg !== undefined ? `
                <div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 0.7rem; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
                    <span>ความลาดชัน 3D: <b style="color:#fff;">${props.slope_deg}°</b></span>
                    <span>มุมทิศ 3D: <b style="color:#fff;">${props.aspect_deg}°</b></span>
                    <span>f_az (ทิศแดด): <b style="color:#eab308;">${props.solar_correction || 1.0}</b></span>
                </div>` : ''}

                <!-- Section 4: 3D Elevations -->
                ${isAI && (props.height_base !== undefined || props.height_eave !== undefined) ? `
                <div style="margin-top: 8px; font-size: 0.72rem; background: rgba(15, 23, 42, 0.75); padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(56, 189, 248, 0.3);">
                    <div style="font-weight: 700; color: #38bdf8; margin-bottom: 5px; display: flex; justify-content: space-between; align-items: center;">
                        <span>📐 ระดับความสูงมุมระนาบ 3 มิติ</span>
                        <span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; font-family: 'JetBrains Mono';">ΔZ: ${(parseFloat(props.delta_z) || (parseFloat(props.height_roof) - parseFloat(props.height_base)) || 0).toFixed(2)} ม.</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; color: #cbd5e1; font-size: 0.7rem;">
                        <div>• ชายคา (Eave): <b style="color: #fff; font-family: 'JetBrains Mono';">${(parseFloat(props.height_base || props.height_eave) || 3.5).toFixed(2)} ม.</b></div>
                        <div>• สันหลังคา (Ridge): <b style="color: #fff; font-family: 'JetBrains Mono';">${(parseFloat(props.height_roof || props.height_ridge) || 5.5).toFixed(2)} ม.</b></div>
                    </div>
                    ${props.corner_elevations ? `
                    <div style="margin-top: 5px; padding-top: 4px; border-top: 1px dashed rgba(255,255,255,0.1); font-size: 0.65rem; color: #94a3b8;">
                        <span style="color: #38bdf8;">ระดับมุม (Corners):</span> 
                        <span style="font-family: 'JetBrains Mono'; color: #f8fafc;">${(Array.isArray(props.corner_elevations) ? props.corner_elevations : JSON.parse(props.corner_elevations)).slice(0, 5).join('ม. → ')}ม...</span>
                    </div>` : ''}
                </div>` : ''}

                <!-- Section 5: Environmental offset & Verification note -->
                <div style="margin-top: 8px; font-size: 0.66rem; color: #94a3b8; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); padding: 5px 8px; border-radius: 6px; line-height: 1.35;">
                    💡 <b style="color: #10b981;">3D Solar Rigor:</b> พื้นที่ติดตั้งจริง (${areaUsable.toFixed(1)} m²) และพลังงานไฟฟ้าถูกคำนวณจากระนาบลาดเอียง 3 มิติ ($A_{3D} = A_{2D} / \\cos\\beta$) ร่วมกับแบบจำลองมุมตกกระทบรังสีดวงอาทิตย์ในอวกาศ 3 มิติ 100%
                </div>

                <div style="margin-top: 6px; font-size: 0.72rem; color: #10b981; display: flex; align-items: center; gap: 4px;">
                    🌱 ลดการปล่อยก๊าซเรือนกระจก: <b>${co2_ton} tCO₂e/ปี</b>
                </div>
            </div>
        `;

        popup.setLngLat(lngLat).setHTML(popupHtml).addTo(map);
    }

    function showBuildingPopup(props, lngLat) {
        const bldId = props.building_id || 'Building';
        const eaveH = (props.height_eave !== undefined) ? parseFloat(props.height_eave).toFixed(1) : '3.5';
        const ridgeH = (props.height_ridge !== undefined) ? parseFloat(props.height_ridge).toFixed(1) : '6.0';
        const floors = props.est_floors || 1;
        const area = (props.area_2d !== undefined) ? parseFloat(props.area_2d).toFixed(1) : '-';
        const cap = (props.capacity_kwp !== undefined) ? parseFloat(props.capacity_kwp).toFixed(1) : '0';
        const kwh = (props.energy_corrected_kwh !== undefined) ? Math.round(parseFloat(props.energy_corrected_kwh)) : 0;
        const savings = (props.savings_thb !== undefined) ? Math.round(parseFloat(props.savings_thb)) : 0;
        const tierColor = props.tier_color || '#eab308';

        const popupHtml = `
            <div style="font-family: 'Inter', sans-serif;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: #f59e0b; text-transform: uppercase;">
                        🏙️ แบบจำลองอาคาร 3 มิติ (3D Buildings)
                    </span>
                    <span style="background: ${tierColor}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-weight: 700;">
                        ${bldId}
                    </span>
                </div>
                <div style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 10px;">
                    อาคารพักอาศัย/พาณิชย์ (${floors} ชั้น)
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.76rem; background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                    <div><span style="color:#94a3b8;">ความสูงชายคา:</span> <b style="color:#38bdf8;">${eaveH} ม.</b></div>
                    <div><span style="color:#94a3b8;">ความสูงสันหลังคา:</span> <b style="color:#fff;">${ridgeH} ม.</b></div>
                    <div><span style="color:#94a3b8;">พื้นที่อาคาร:</span> <b style="color:#fff;">${area} m²</b></div>
                    <div><span style="color:#94a3b8;">ศักยภาพ PV รวม:</span> <b style="color:#f97316; font-family: 'JetBrains Mono';">${cap} kWp</b></div>
                    <div><span style="color:#94a3b8;">ผลิตไฟฟ้า/ปี:</span> <b style="color:#eab308; font-family: 'JetBrains Mono';">${kwh.toLocaleString()} kWh</b></div>
                    <div><span style="color:#94a3b8;">ประหยัดค่าไฟ:</span> <b style="color:#10b981; font-family: 'JetBrains Mono';">${savings.toLocaleString()} ฿/y</b></div>
                </div>
                <div style="margin-top: 8px; font-size: 0.7rem; color: #94a3b8; background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">
                    📐 <i>สกัดความสูงชายคาจาก nDSM จุดต่ำสุดของหลังคา (Min Facet Height) และรวมกลุ่มระนาบติดกันเป็นอาคารเดียว</i>
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
            if (map.getLayer('layer-ai-buildings-3d')) map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', 'none');

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
            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', is3DMode ? 'visible' : 'none');
            }

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
            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', is3DMode ? 'visible' : 'none');
            }

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
        ['base-light', 'base-carto', 'base-satellite', 'base-osm'].forEach(id => {
            if (map.getLayer(id)) {
                map.setLayoutProperty(id, 'visibility', id === baseId ? 'visible' : 'none');
            }
        });
        document.querySelectorAll('.base-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.base === baseId);
        });
    };

    window.toggleTheme = function() {
        document.body.classList.toggle('theme-light');
        const isLight = document.body.classList.contains('theme-light');
        window.switchBasemap(isLight ? 'base-light' : 'base-carto');
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

    let is3DMode = false;
    let current3DSubMode = 'facets'; // 'facets', 'combined', 'buildings'
    let currentFacetColorMode = 'tier';  // 'tier', 'orient'

    window.toggleAiBuildingsLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-ai-buildings-line', 'visibility', vis);
        if (map.getLayer('layer-ai-buildings-3d')) {
            map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', (is3DMode && checkbox.checked && current3DSubMode !== 'facets') ? 'visible' : 'none');
        }
    };

    window.toggleAiFacetsLayer = function(checkbox) {
        const vis = checkbox.checked ? 'visible' : 'none';
        map.setLayoutProperty('layer-ai-facets-fill', 'visibility', vis);
        map.setLayoutProperty('layer-ai-facets-stroke', 'visibility', vis);
        if (map.getLayer('layer-ai-facets-3d')) {
            map.setLayoutProperty('layer-ai-facets-3d', 'visibility', (is3DMode && checkbox.checked && current3DSubMode !== 'buildings') ? 'visible' : 'none');
        }
    };

    window.set3DSubMode = function(subMode) {
        current3DSubMode = subMode;
        
        // Update sub-mode button UI
        document.getElementById('btn-3d-sub-bld')?.classList.toggle('active', subMode === 'buildings');
        document.getElementById('btn-3d-sub-facet')?.classList.toggle('active', subMode === 'facets');
        document.getElementById('btn-3d-sub-comb')?.classList.toggle('active', subMode === 'combined');

        if (!is3DMode) return;

        if (subMode === 'buildings') {
            // Whole 3D Buildings
            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', 'visible');
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-opacity', 0.88);
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-color', [
                    'case',
                    ['has', 'tier_color'], ['get', 'tier_color'],
                    '#38bdf8'
                ]);
            }
            if (map.getLayer('layer-ai-facets-3d')) {
                map.setLayoutProperty('layer-ai-facets-3d', 'visibility', 'none');
            }
        } else if (subMode === 'facets') {
            // Separate 3D Roof Facets (positioned at their real roof base height!)
            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', 'none');
            }
            if (map.getLayer('layer-ai-facets-3d')) {
                map.setLayoutProperty('layer-ai-facets-3d', 'visibility', 'visible');
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-base', ['coalesce', ['get', 'height_base'], ['get', 'height_eave'], 3.5]);
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-height', ['coalesce', ['get', 'height_roof'], ['get', 'height_ridge'], 5.5]);
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-opacity', 0.95);
                applyFacet3DColors();
            }
        } else if (subMode === 'combined') {
            // Combined: semi-transparent building walls + 3D roof facets on top!
            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', 'visible');
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-base', 0);
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-height', ['coalesce', ['get', 'height_eave'], 3.5]);
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-opacity', 0.45);
                map.setPaintProperty('layer-ai-buildings-3d', 'fill-extrusion-color', '#475569');
            }
            if (map.getLayer('layer-ai-facets-3d')) {
                map.setLayoutProperty('layer-ai-facets-3d', 'visibility', 'visible');
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-base', ['coalesce', ['get', 'height_base'], ['get', 'height_eave'], 3.5]);
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-height', ['coalesce', ['get', 'height_roof'], ['get', 'height_ridge'], 5.5]);
                map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-opacity', 0.98);
                applyFacet3DColors();
            }
        }
    };

    window.setFacetColorMode = function(colorMode) {
        currentFacetColorMode = colorMode;
        document.getElementById('btn-color-tier')?.classList.toggle('active', colorMode === 'tier');
        document.getElementById('btn-color-orient')?.classList.toggle('active', colorMode === 'orient');
        applyFacet3DColors();
    };

    function applyFacet3DColors() {
        if (!map.getLayer('layer-ai-facets-3d')) return;
        if (currentFacetColorMode === 'orient') {
            map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-color', [
                'case',
                ['has', 'orientation_color'], ['get', 'orientation_color'],
                ['has', 'color'], ['get', 'color'],
                '#3b82f6'
            ]);
        } else {
            map.setPaintProperty('layer-ai-facets-3d', 'fill-extrusion-color', [
                'case',
                ['has', 'tier_color'], ['get', 'tier_color'],
                ['has', 'energy_color'], ['get', 'energy_color'],
                '#eab308'
            ]);
        }
    }

    window.toggle3DCity = function() {
        is3DMode = !is3DMode;
        const btn = document.getElementById('btn-3d-city');
        const pnl3d = document.getElementById('city-3d-controls');
        const chkBld = document.getElementById('chk-ai-buildings');

        if (is3DMode) {
            if (btn) {
                btn.style.background = 'rgba(245, 158, 11, 0.45)';
                btn.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.6)';
                btn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <span>🗺️ มุมมอง 2 มิติ (2D Map)</span>
                `;
            }
            if (pnl3d) pnl3d.style.display = 'block';
            if (chkBld) chkBld.checked = true;

            // Apply active 3D submode
            window.set3DSubMode(current3DSubMode);

            if (map.getLayer('layer-ai-buildings-line')) {
                map.setLayoutProperty('layer-ai-buildings-line', 'visibility', 'visible');
            }

            map.easeTo({
                pitch: 58,
                bearing: -25,
                duration: 1500
            });
        } else {
            if (btn) {
                btn.style.background = 'rgba(245, 158, 11, 0.2)';
                btn.style.boxShadow = 'none';
                btn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                    <span>🏙️ มุมมอง 3 มิติ (3D City)</span>
                `;
            }
            if (pnl3d) pnl3d.style.display = 'none';

            if (map.getLayer('layer-ai-buildings-3d')) {
                map.setLayoutProperty('layer-ai-buildings-3d', 'visibility', 'none');
            }
            if (map.getLayer('layer-ai-facets-3d')) {
                map.setLayoutProperty('layer-ai-facets-3d', 'visibility', 'none');
            }

            // Restore 2D mode layers
            window.setDashboardMode(currentMode);

            map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 1200
            });
        }
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
                    🎯 <b>ผลการวิเคราะห์ GeoAI:</b> โมเดล AI 5-Fold Ensemble สามารถกู้คืนศักยภาพพลังงานติดตั้งได้ถึง <b>${diff.capacity_pct_ratio}% (${ai.total_capacity_mwp.toFixed(2)} จาก ${gt.total_capacity_mwp.toFixed(2)} MWp)</b> โดยมีจำนวนระนาบที่กระชับและรวมระนาบเล็กที่มีความต่อเนื่องเชิงพื้นที่ ส่งผลให้การจัดวางแผงเป็นไปได้จริงทางวิศวกรรม
                </div>
            </div>
        `;
    }
});

// =========================================================================
// SITE TITLE & MUNICIPALITY BRANDING ENGINE (Custom Portal Title - Global Scope)
// =========================================================================
const DEFAULT_SITE_TITLE = "Maechan SolarRoof";
const DEFAULT_SITE_SUBTITLE = "เทศบาลตำบลแม่จัน จ.เชียงราย (2.22 ตร.กม.)";

window.openTitleModal = function(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const modal = document.getElementById('modal-title-settings');
    if (!modal) {
        console.warn("Modal element #modal-title-settings not found");
        return;
    }
    const currentTitle = localStorage.getItem('uav_solarnet_custom_title') || 
        (document.getElementById('brand-title') ? document.getElementById('brand-title').innerText.replace('✏️', '').trim() : DEFAULT_SITE_TITLE);
    const currentSubtitle = localStorage.getItem('uav_solarnet_custom_subtitle') || 
        (document.getElementById('brand-subtitle') ? document.getElementById('brand-subtitle').innerText.trim() : DEFAULT_SITE_SUBTITLE);

    const inpTitle = document.getElementById('input-portal-title');
    const inpSub = document.getElementById('input-portal-subtitle');
    if (inpTitle) inpTitle.value = currentTitle;
    if (inpSub) inpSub.value = currentSubtitle;

    modal.style.display = 'flex';
    setTimeout(() => { if (inpTitle) inpTitle.focus(); }, 100);
};

window.closeTitleModal = function(e) {
    if (e && e.target && e.target.id !== 'modal-title-settings' && !e.target.classList.contains('modal-close')) {
        // Only close if clicking backdrop or close button
        return;
    }
    const modal = document.getElementById('modal-title-settings');
    if (modal) modal.style.display = 'none';
};

window.saveTitleSettings = function(e) {
    if (e) e.preventDefault();
    const inpTitle = document.getElementById('input-portal-title');
    const inpSub = document.getElementById('input-portal-subtitle');
    const titleVal = inpTitle ? inpTitle.value.trim() : '';
    const subVal = inpSub ? inpSub.value.trim() : '';

    const finalTitle = titleVal || DEFAULT_SITE_TITLE;
    const finalSubtitle = subVal || DEFAULT_SITE_SUBTITLE;

    localStorage.setItem('uav_solarnet_custom_title', finalTitle);
    localStorage.setItem('uav_solarnet_custom_subtitle', finalSubtitle);

    applySiteTitles(finalTitle, finalSubtitle);
    const modal = document.getElementById('modal-title-settings');
    if (modal) modal.style.display = 'none';
};

window.resetTitleDefault = function(e) {
    if (e) e.preventDefault();
    localStorage.removeItem('uav_solarnet_custom_title');
    localStorage.removeItem('uav_solarnet_custom_subtitle');

    applySiteTitles(DEFAULT_SITE_TITLE, DEFAULT_SITE_SUBTITLE);
    const inpTitle = document.getElementById('input-portal-title');
    const inpSub = document.getElementById('input-portal-subtitle');
    if (inpTitle) inpTitle.value = DEFAULT_SITE_TITLE;
    if (inpSub) inpSub.value = DEFAULT_SITE_SUBTITLE;
    const modal = document.getElementById('modal-title-settings');
    if (modal) modal.style.display = 'none';
};

function applySiteTitles(title, subtitle) {
    const titleEl = document.getElementById('brand-title');
    const subtitleEl = document.getElementById('brand-subtitle');

    if (titleEl) {
        const words = title.split(' ');
        if (words.length >= 2) {
            titleEl.innerHTML = `${words[0]} <span>${words.slice(1).join(' ')}</span> <span class="title-edit-hint" style="font-size:0.75rem; opacity:0.6; margin-left:4px;">✏️</span>`;
        } else {
            titleEl.innerHTML = `${title} <span class="title-edit-hint" style="font-size:0.75rem; opacity:0.6; margin-left:4px;">✏️</span>`;
        }
    }
    if (subtitleEl) {
        subtitleEl.innerText = subtitle;
    }
    document.title = `${title} | ${subtitle}`;
}

// Auto-load saved custom title from localStorage if available
function initCustomTitles() {
    const savedTitle = localStorage.getItem('uav_solarnet_custom_title');
    const savedSubtitle = localStorage.getItem('uav_solarnet_custom_subtitle');
    if (savedTitle || savedSubtitle) {
        applySiteTitles(savedTitle || DEFAULT_SITE_TITLE, savedSubtitle || DEFAULT_SITE_SUBTITLE);
    }
    
    // Bind explicit click listeners as backup
    const brandCont = document.getElementById('brand-container');
    if (brandCont) {
        brandCont.addEventListener('click', window.openTitleModal);
    }
    const btnSettings = document.getElementById('btn-title-settings');
    if (btnSettings) {
        btnSettings.addEventListener('click', window.openTitleModal);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomTitles);
} else {
    initCustomTitles();
}


