# Mae Chan Rooftop Solar Potential WebGIS Dashboard (Maechan_SolarRoof)

[![Deploy to GitHub Pages](https://github.com/theerasakoopp/Maechan_SolarRoof/actions/workflows/deploy.yml/badge.svg)](https://github.com/theerasakoopp/Maechan_SolarRoof/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen)](https://theerasakoopp.github.io/Maechan_SolarRoof/)
[![Research Paper](https://img.shields.io/badge/Paper-Elsevier%20RSASE%202026-orange)](https://github.com/theerasakoopp/Maechan_SolarRoof)

An interactive, high-performance WebGIS decision-support system evaluating 3D rooftop solar photovoltaic (PV) potential across **Mae Chan Subdistrict Municipality (เทศบาลตำบลแม่จัน)**, Chiang Rai, Thailand (2.22 km²). 

Powered by **UAV-SolarNet GeoAI semantic segmentation** and ultra-high resolution **10 cm UAV orthophotography**.

---

## 🌟 Key Features
- **Empirical 3D Rooftop Intelligence:** Complete inventory of **10,654 rooftop facets** strictly bounded within Mae Chan municipal jurisdiction.
- **Aggregated Solar Capacity:** **60.83 MWp** geographic technical potential, producing **78.32 GWh/year** clean electricity and **352.43 million THB/year** in municipal bill savings.
- **4 Capacity Tiers (Thai DEDE & EIT Standards):**
  - **Tier 3 (>5 kWp):** 3,361 facets (45.21 MWp, 74.3%) — Commercial & large shophouses.
  - **Tier 2 (3–5 kWp):** 2,045 facets (8.05 MWp, 13.2%) — Standard residential dwellings.
  - **Tier 1 (1.5–3 kWp):** 2,348 facets (5.14 MWp, 8.4%) — Micro-solar & small townhouses.
  - **Sub-optimal (<1.5 kWp):** 2,900 facets (2.44 MWp, 4.0%) — Minor structural additions.
- **Ultra-High Resolution UAV Imagery:** Seamless streaming of **10 cm GSD UAV photogrammetry** across Zoom levels 15–20 in modern WebP format.
- **Interactive Rooftop Inspector:** Click any building to view tilt, azimuth, usable area, PV system size, annual savings, and estimated simple payback period.
- **Dynamic Tariff & ROI Simulator:** Adjust local electricity tariffs (THB/kWh) and solar CAPEX to simulate real-time municipal clean energy returns.

---

## 🚀 Live Access
- **URL:** [https://theerasakoopp.github.io/Maechan_SolarRoof/](https://theerasakoopp.github.io/Maechan_SolarRoof/)

---

## 📚 Citation & Research Context
This platform serves as the open-science WebGIS deployment for the research manuscript:
> **"Deep Learning Decoders and Backbone Scaling for UAV-Based 3D Rooftop Facet Segmentation and Municipal Solar Photovoltaic Potential Assessment"**  
> *Under submission to Elsevier: Remote Sensing Applications: Society and Environment (RSASE)*.

---

## 🛠️ Tech Stack
- **Mapping Engine:** [MapLibre GL JS](https://maplibre.org/)
- **Vector Data:** GeoJSON (EPSG:4326 WGS84)
- **Raster Tiles:** 10 cm GSD XYZ WebP Tiles (Web Mercator EPSG:3857)
- **Deployment:** GitHub Pages + GitHub Actions CI/CD
