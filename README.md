# PlantPulse Circular 🌿
### A 3D Virtual Digital Twin for Closed-Loop Water, Nutrient & Carbon Management

PlantPulse Circular is a complete, fully coded **Virtual Digital Twin** of a sustainable circular garden ecosystem. It couples **Three.js WebGL 3D graphics**, an **IoT MQTT messaging bus**, a **Random Forest Machine Learning decision engine**, and a **closed-loop circular economy physics simulator** with an interactive glassmorphic dashboard.

---

## 🌟 What We Built & Key Differentiators

Unlike traditional static dashboards or cumbersome Unity/Blender setups that require multi-gigabyte software installs, PlantPulse Circular runs **100% in any modern web browser** with zero installation hurdles:

1. **Interactive 3D Virtual Digital Twin (Three.js WebGL):**
   - **Procedural 3D Plant Beds:** Roma Tomatoes (with climbing vines and red fruit), Sweet Basil (dense aromatic bush clusters), and Baby Spinach (crisp broad rosettes).
   - **Dynamic Soil Hydration Shader:** Real-time visual transition from dry dusty clay (`#c48b5b`) to rich dark loam (`#271911`) based on soil moisture %.
   - **Dynamic Plant Phenology & Wilting:** Plants realistically droop, curl, and turn sickly yellow under water deficit, and perk up vibrant green when healthy.
   - **Smart Rainwater Cistern:** Transparent acrylic/glass cylinder showing real-time animated water level, oscillating surface waves, inflow downspout, and solar pump status LED.
   - **Aerobic Compost Bioreactor:** Hexagonal tumbler drum on an A-frame stand featuring active thermophilic steam particles rising during aerobic decomposition.
   - **Dynamic Weather System:** Real-time 3D falling rain particle streaks during rainfall, moving sunlight shadows, and micro-sprinkler droplets spraying onto beds during irrigation.
   - **Interactive Raycasting & Inspection HUD:** Hovering or clicking any 3D bed, tank, or compost unit highlights it and opens a live telemetry card with one-click manual overrides.
   - **Camera Presets:** Smooth camera transitions between Panoramic, Tomato Bed, Basil Bed, Spinach Bed, Rain Tank, Compost Unit, and Top-Down Heatmap.

2. **Machine Learning Decision Engine:**
   - **Random Forest Regressor (120 Trees):** Predicts precise evapotranspiration irrigation demand per bed, achieving $R^2 = 0.969$ and $\text{MAE} = 0.799\text{ L}$.
   - **Baseline Benchmark Comparison:** Compares ML against a traditional Fixed-Timer Baseline ($\text{MAE} = 6.50\text{ L}$) and Rule-Based Threshold ($\text{MAE} = 3.27\text{ L}$).
   - **Feature Importance Ranking:** Visual breakdown of predictive factors (Soil Moisture Deficit 69.9%, Bed Area 21.2%, Light 4.1%, Temperature 2.5%, Crop Type 1.0%).

3. **Scenario Simulator (A/B Parallel Digital Twin):**
   - **1-Click Stress Test:** Runs both Conventional Linear (tap water, landfill waste, fixed schedule) and Circular Digital Twin side-by-side under identical weather series.
   - **Built-in Scenarios:** *Summer Heatwave & Drought* (36-40°C), *Monsoon Deluge* (8-28mm rain), and *Variable Spring*.
   - **Comparative Charts & Audit Export:** Generates comparative Chart.js time-series and downloadable CSV audit reports proving up to **80.9% freshwater savings** and **100% organic waste diversion**.

4. **MQTT IoT Telemetry & Control Bridge:**
   - Powered by Paho-MQTT, publishing telemetry across structured topics (`plantpulse/telemetry/weather`, `plantpulse/telemetry/beds/{id}`, `plantpulse/telemetry/tank`, `plantpulse/telemetry/sustainability`).
   - Listens for remote control commands (`plantpulse/commands/step`, `plantpulse/commands/mode`).
   - Integrated live telemetry log console in the web interface.

---

## 🚀 Quick Start Guide

### Prerequisites
- Python 3.10+ (Tested with Python 3.10 – 3.14)
- Modern Web Browser (Chrome, Firefox, Edge, Safari)

### 1. Setup Environment
```powershell
# In PowerShell / Terminal:
python -m venv .venv
# Activate on Windows:
.venv\Scripts\Activate.ps1
# (Or on Linux/macOS: source .venv/bin/activate)

# Install required dependencies
python -m pip install -r requirements.txt
```

### 2. Train the Random Forest Model
```powershell
python -m backend.train_model

```
*(Trains the model on 4,000 synthetic microclimate records and outputs metrics to `models/irrigation_demand.joblib`)*

### 3. Launch the Virtual Digital Twin
```powershell
python -m backend.app
```
Open **[http://127.0.0.1:5000](http://127.0.0.1:5000)** in your browser!

---

## 🧪 Automated Tests

Run the comprehensive pytest suite verifying state transitions, circular accounting, ML metrics, and API endpoints:
```powershell
.venv\Scripts\python -m pytest -v
```
All 9 test suites validate cleanly.

---

## 📊 Core Mathematical Formulas & LCA Accounting

- **Water Saved:**
  $$\text{Freshwater Saved (L)} = \max(0, \text{Baseline Tap Water} - \text{Circular Freshwater Used})$$
- **Water Savings (%):**
  $$\text{Water Savings (\%)} = \frac{\text{Freshwater Saved}}{\text{Baseline Tap Water}} \times 100$$
- **Organic Waste Recovery Rate (%):**
  $$\text{Waste Recovery (\%)} = \min\left(100, \frac{\text{Organic Waste Composted (kg)}}{\text{Total Eligible Waste (kg)}} \times 100\right)$$
- **Solar Pump Energy Consumption:**
  $$\text{Energy (kWh)} = \text{Irrigation (L)} \times 0.00035\text{ kWh/L}$$
- **Avoided Carbon Emissions ($kg\text{ CO}_2\text{e}$):**
  $$\text{Avoided CO}_2\text{e} = (\text{Rainwater Reused (L)} \times 0.0003) + (\text{Compost Applied (kg)} \times 1.2)$$

---

## 📁 Repository Structure

```
plantpulse-circular-digital-twin/
├── backend/
│   ├── app.py                 # Flask REST API, static server, and twin orchestration
│   ├── config.py              # System physical parameters & LCA emission factors
│   ├── ml.py                  # Random Forest training, evaluation & inference
│   ├── mqtt_manager.py        # Paho MQTT telemetry bridge & command listener
│   ├── simulation.py          # Deterministic digital twin state physics & scenarios
│   └── train_model.py         # Standalone model training CLI
├── dashboard/
│   ├── index.html             # Main digital twin single-page application
│   ├── style.css              # Cyber-botanic glassmorphic design system
│   ├── twin3d.js              # Three.js 3D WebGL Digital Twin Engine
│   └── app.js                 # Frontend telemetry controller & Chart.js charts
├── data/
│   ├── README.md              # Synthetic dataset provenance documentation
│   └── synthetic_irrigation_training.csv
├── docs/
│   ├── architecture.md        # Detailed twin architecture & communication diagrams
│   └── methodology.md         # Scientific equations, agronomic assumptions & LCA
├── models/
│   └── irrigation_demand.joblib # Serialized Random Forest model & metrics bundle
├── tests/
│   ├── test_api.py            # API endpoint and telemetry tests
│   └── test_simulation.py     # Water balance, compost loop & constraint tests
├── unity-twin/                # Optional Unity C# scripts for teams with Unity exposure
├── requirements.txt           # Python dependencies
└── README.md                  # Project overview and guide
```

