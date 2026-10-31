/**
 * PlantPulse Circular - Main Frontend Controller & Telemetry Engine
 * Coordinates UI, Three.js Digital Twin, ML Analytics, Scenario Simulations, and MQTT Streaming.
 */

let currentSnapshot = null;
let twin3D = null;
let autoPlayTimer = null;
let isAutoPlaying = false;
let comparisonChart = null;
let latestExperimentData = null;

const $ = id => document.getElementById(id);
const fmt = (v, n = 1) => Number(v ?? 0).toFixed(n);
const setTxt = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
};

// -------------------------------------------------------------
// API Helper
// -------------------------------------------------------------
async function api(path, body = null) {
    try {
        const response = await fetch(path, {
            method: body ? "POST" : "GET",
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API Request Failed");
        return data;
    } catch (err) {
        console.error("API error at " + path, err);
        throw err;
    }
}

// -------------------------------------------------------------
// Initialization
// -------------------------------------------------------------
window.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize 3D Digital Twin Engine
    try {
        twin3D = new GardenTwin3D("canvas-3d-container", handleObjectSelected);
    } catch (e) {
        console.warn("WebGL / Three.js 3D initialization warning:", e);
    }

    // 2. Setup UI Event Listeners
    setupTabNavigation();
    setupControls();
    setupCameraToolbar();
    setupScenarioRunner();
    setupMqttConsole();

    // 3. Load Initial Twin State & ML Info
    await refreshState();
    await loadMLInfo();

    // 4. Start MQTT polling loop for live telemetry console
    setInterval(pollMqttMessages, 2500);
});

// -------------------------------------------------------------
// State Rendering & Telemetry Updates
// -------------------------------------------------------------
function render(snapshot) {
    currentSnapshot = snapshot;
    const s = snapshot.state;
    const m = snapshot.sustainability;
    const w = s.weather;
    const ml = snapshot.ml_evaluation || {};

    // 1. Top KPI Metrics Ribbon
    setTxt("kpi-fresh", fmt(m.freshwater_used_l) + " L");
    setTxt("kpi-fresh-sub", fmt(m.freshwater_saved_l_vs_fixed_baseline) + " L (" + fmt(m.freshwater_savings_pct_vs_fixed_baseline) + "%) saved");

    setTxt("kpi-rain", fmt(m.rainwater_reused_l) + " L");
    setTxt("kpi-rain-sub", fmt(s.tank_l) + " L currently in cistern");

    setTxt("kpi-waste", fmt(m.organic_waste_recovery_pct) + "%");
    setTxt("kpi-waste-sub", fmt(m.organic_waste_composted_kg) + " kg converted to compost");

    setTxt("kpi-health", fmt(m.average_plant_health_pct) + "%");
    setTxt("kpi-emissions", fmt(m.avoided_emissions_kg_co2e, 3) + " kg");
    setTxt("kpi-cost", "$" + fmt(m.estimated_cost_saved_units, 2));

    // 2. Viewport HUD
    setTxt("hud-step", `Step ${s.step}`);
    setTxt("hud-hours", `${s.step * 6} hrs elapsed`);
    setTxt("hud-temp", `${fmt(w.temperature_c, 0)}°C`);
    setTxt("hud-light", `${Math.round(w.light_index * 100)}%`);
    setTxt("hud-rain", `${fmt(w.rainfall_mm, 1)} mm`);
    setTxt("hud-mode", snapshot.mode.toUpperCase());

    // 3. Mini Telemetry Controls
    if ($("mode-select")) $("mode-select").value = snapshot.mode;
    setTxt("mini-tank-val", `${fmt(s.tank_l)} / ${fmt(s.tank_capacity_l, 0)} L`);
    const tankPct = Math.min(100, (s.tank_l / (s.tank_capacity_l || 500)) * 100);
    if ($("mini-tank-bar")) $("mini-tank-bar").style.width = `${tankPct}%`;
    setTxt("mini-tank-status", `Storage: ${fmt(tankPct)}% (${s.tank_l > 480 ? 'Overflow Risk' : 'Normal'})`);

    setTxt("mini-compost-val", `${fmt(s.compost_ready_kg, 2)} kg ready`);
    setTxt("mini-waste-queued", `${fmt(s.organic_waste_kg, 2)} kg`);
    setTxt("mini-pile-temp", `${fmt(s.compost_pile_temp_c || 48.5)}°C`);

    setTxt("latest-action-msg", s.last_action ? s.last_action.message : "Ready");

    // 4. Plant Beds Mini Cards
    const predictions = snapshot.predictions_l_by_bed || {};
    $("beds-mini-container").innerHTML = s.beds.map(b => {
        const icon = b.plant === "Tomato" ? "🍅" : b.plant === "Basil" ? "🌿" : "🥬";
        const predL = predictions[b.id] !== undefined ? fmt(predictions[b.id]) : "—";
        const isLow = b.moisture_pct < 28;
        return `
            <div class="bed-mini-card" onclick="focusBed('${b.id}')">
                <div class="bed-header">
                    <span class="bed-title">${icon} ${b.plant}</span>
                    <small style="color:${isLow ? '#ef4444' : '#34d399'}; font-weight:600;">
                        ${isLow ? 'Dry' : 'Optimal'}
                    </small>
                </div>
                <div class="bed-stats-row">
                    <span>Moisture: <b>${fmt(b.moisture_pct)}%</b></span>
                    <span>ML: <b>${predL}L</b></span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill moisture" style="width:${b.moisture_pct}%"></div>
                </div>
                <div class="bed-stats-row">
                    <span>Health: <b>${fmt(b.health_pct)}%</b></span>
                    <span>${b.soil_temp_c ? b.soil_temp_c + '°C' : ''}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill health" style="width:${b.health_pct}%"></div>
                </div>
            </div>
        `;
    }).join("");

    // 5. ML Decision Tab Values
    setTxt("ml-total-demand", `${fmt(snapshot.predicted_total_demand_l)} L`);
    setTxt("ml-mae", `${fmt(ml.mae_l, 3)} L`);
    setTxt("ml-rmse", `${fmt(ml.rmse_l, 3)} L`);
    if (ml.r2_score) setTxt("ml-r2", `${(ml.r2_score * 100).toFixed(1)}% (${fmt(ml.r2_score, 4)})`);

    $("ml-bed-bars").innerHTML = s.beds.map(b => {
        const predL = predictions[b.id] || 0;
        const pct = Math.min(100, (predL / 12) * 100);
        return `
            <div class="forecast-item">
                <span style="width: 75px;">${b.plant}</span>
                <div class="forecast-track">
                    <div class="forecast-fill" style="width:${pct}%"></div>
                </div>
                <b style="width: 55px; text-align:right;">${fmt(predL)} L</b>
            </div>
        `;
    }).join("");

    // 6. Update 3D Digital Twin Engine
    if (twin3D) {
        twin3D.updateState(snapshot);
    }

    // 7. Refresh Inspection Card if open
    if (twin3D && twin3D.selectedObject) {
        updateInspectionCard(twin3D.selectedObject);
    }
}

async function refreshState() {
    try {
        const snap = await api("/api/state");
        render(snap);
    } catch (e) {
        console.error("Failed to refresh state", e);
    }
}

// -------------------------------------------------------------
// Interactive 3D Object Selection HUD
// -------------------------------------------------------------
function handleObjectSelected(objData) {
    updateInspectionCard(objData);
    $("inspection-card").style.display = "block";
}

function updateInspectionCard(objData) {
    if (!currentSnapshot || !objData) return;
    const card = $("inspection-card");
    const title = $("inspect-title");
    const content = $("inspect-content");
    const s = currentSnapshot.state;

    if (objData.type === "bed") {
        const bed = s.beds.find(b => b.id === objData.id) || s.beds[0];
        const icon = bed.plant === "Tomato" ? "🍅" : bed.plant === "Basil" ? "🌿" : "🥬";
        title.innerHTML = `${icon} ${bed.plant} Bed (${bed.id})`;
        const predL = currentSnapshot.predictions_l_by_bed[bed.id] || 0;

        content.innerHTML = `
            <div class="card-row"><span>Soil Moisture:</span><b>${fmt(bed.moisture_pct)}%</b></div>
            <div class="card-row"><span>Crop Health:</span><b>${fmt(bed.health_pct)}%</b></div>
            <div class="card-row"><span>Soil Temp:</span><b>${bed.soil_temp_c || 26.0}°C</b></div>
            <div class="card-row"><span>Bed Area:</span><b>${bed.area_m2} m²</b></div>
            <div class="card-row"><span>Growth Stage:</span><b style="text-transform:capitalize;">${bed.growth_stage}</b></div>
            <div class="card-row"><span>ML Predicted Demand:</span><b style="color:#34d399;">${fmt(predL)} L</b></div>
            <button class="btn-primary" style="margin-top:0.6rem; width:100%; padding:0.45rem; font-size:0.75rem;" onclick="spotIrrigate('${bed.id}', 3.0)">
                💧 Spot Irrigate +3 L
            </button>
        `;
    } else if (objData.type === "tank") {
        title.innerHTML = `💧 Rainwater Cistern`;
        content.innerHTML = `
            <div class="card-row"><span>Current Volume:</span><b>${fmt(s.tank_l)} L</b></div>
            <div class="card-row"><span>Total Capacity:</span><b>${s.tank_capacity_l || 500} L</b></div>
            <div class="card-row"><span>Storage Percentage:</span><b>${fmt((s.tank_l / (s.tank_capacity_l || 500)) * 100)}%</b></div>
            <div class="card-row"><span>Catchment Efficiency:</span><b>80% (Roof Runoff)</b></div>
            <div class="card-row"><span>Booster Pump:</span><b>Solar 0.00035 kWh/L</b></div>
            <button class="btn-primary" style="margin-top:0.6rem; width:100%; padding:0.45rem; font-size:0.75rem;" onclick="harvestRainManual(60)">
                🌧 Catchment Flush +60 L
            </button>
        `;
    } else if (objData.type === "compost") {
        title.innerHTML = `♻ Aerobic Bioreactor`;
        content.innerHTML = `
            <div class="card-row"><span>Ready Organic Compost:</span><b>${fmt(s.compost_ready_kg, 2)} kg</b></div>
            <div class="card-row"><span>Raw Garden Trimmings:</span><b>${fmt(s.organic_waste_kg, 2)} kg</b></div>
            <div class="card-row"><span>Active Batches:</span><b>${(s.composting_batches || []).length} batch(es)</b></div>
            <div class="card-row"><span>Internal Thermophilic:</span><b>${fmt(s.compost_pile_temp_c || 48.5)}°C</b></div>
            <button class="btn-primary" style="margin-top:0.6rem; width:100%; padding:0.45rem; font-size:0.75rem;" onclick="addGardenWaste(1.0)">
                🍂 Feed Garden Prunings +1 kg
            </button>
        `;
    }
}

window.focusBed = function(bedId) {
    if (twin3D) {
        twin3D.setCameraPreset(bedId === "bed-1" ? "bed1" : bedId === "bed-2" ? "bed2" : "bed3");
        handleObjectSelected({ type: "bed", id: bedId });
    }
};

window.spotIrrigate = async function(bedId, liters) {
    try {
        const snap = await api("/api/step", { irrigation_l: liters });
        render(snap);
    } catch (e) {
        alert(e.message);
    }
};

window.harvestRainManual = async function(liters) {
    try {
        const snap = await api("/api/step", { inputs: { rainfall_mm: 8.0 } });
        render(snap);
    } catch (e) {
        alert(e.message);
    }
};

window.addGardenWaste = async function(kg) {
    try {
        const snap = await api("/api/step", { inputs: {} });
        render(snap);
    } catch (e) {
        alert(e.message);
    }
};

$("inspect-close").onclick = () => {
    $("inspection-card").style.display = "none";
    if (twin3D) twin3D.selectedObject = null;
};

// -------------------------------------------------------------
// UI Controls & Handlers
// -------------------------------------------------------------
function setupControls() {
    // Sliders dynamic value display
    $("slider-temp").oninput = () => $("val-temp").textContent = `${$("slider-temp").value}°C`;
    $("slider-light").oninput = () => $("val-light").textContent = `${$("slider-light").value}%`;
    $("slider-rain").oninput = () => $("val-rain").textContent = `${$("slider-rain").value} mm`;

    // Mode Selector
    $("mode-select").onchange = async () => {
        try {
            const snap = await api("/api/mode", { mode: $("mode-select").value });
            render(snap);
        } catch (e) {
            alert(e.message);
        }
    };

    // Advance Step Button
    $("btn-advance").onclick = async () => {
        try {
            const snap = await api("/api/step", {
                inputs: {
                    temperature_c: +$("slider-temp").value,
                    light_index: +$("slider-light").value / 100,
                    rainfall_mm: +$("slider-rain").value
                }
            });
            render(snap);
            // Reset rainfall slider back to 0 mm after catchment
            $("slider-rain").value = 0;
            $("val-rain").textContent = "0 mm";
        } catch (e) {
            alert(e.message);
        }
    };

    // Auto-Play Toggle
    $("btn-auto").onclick = () => {
        isAutoPlaying = !isAutoPlaying;
        if (isAutoPlaying) {
            $("auto-icon").textContent = "⏸";
            $("auto-text").textContent = "Pause";
            $("btn-auto").classList.add("active");
            autoPlayTimer = setInterval(async () => {
                // Add minor organic drift to weather inputs
                const currentTemp = +$("slider-temp").value;
                const newTemp = Math.min(42, Math.max(16, currentTemp + (Math.random() - 0.5) * 2));
                $("slider-temp").value = Math.round(newTemp);
                $("val-temp").textContent = `${Math.round(newTemp)}°C`;

                $("btn-advance").click();
            }, 3000);
        } else {
            $("auto-icon").textContent = "▶";
            $("auto-text").textContent = "Auto";
            $("btn-auto").classList.remove("active");
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    };

    // Reset Button
    $("btn-reset").onclick = async () => {
        if (isAutoPlaying) $("btn-auto").click();
        try {
            const snap = await api("/api/reset");
            render(snap);
        } catch (e) {
            alert(e.message);
        }
    };

    // Weather Presets
    $("preset-drought").onclick = () => {
        $("slider-temp").value = 39;
        $("val-temp").textContent = "39°C";
        $("slider-light").value = 95;
        $("val-light").textContent = "95%";
        $("slider-rain").value = 0;
        $("val-rain").textContent = "0 mm";
    };

    $("preset-monsoon").onclick = () => {
        $("slider-temp").value = 23;
        $("val-temp").textContent = "23°C";
        $("slider-light").value = 30;
        $("val-light").textContent = "30%";
        $("slider-rain").value = 24;
        $("val-rain").textContent = "24 mm";
    };

    $("preset-spring").onclick = () => {
        $("slider-temp").value = 24;
        $("val-temp").textContent = "24°C";
        $("slider-light").value = 75;
        $("val-light").textContent = "75%";
        $("slider-rain").value = 5;
        $("val-rain").textContent = "5 mm";
    };

    $("preset-opt").onclick = () => {
        $("slider-temp").value = 26;
        $("val-temp").textContent = "26°C";
        $("slider-light").value = 80;
        $("val-light").textContent = "80%";
        $("slider-rain").value = 0;
        $("val-rain").textContent = "0 mm";
    };

    // Mini infrastructure click handlers
    $("eco-tank-card").onclick = () => {
        if (twin3D) {
            twin3D.setCameraPreset("tank");
            handleObjectSelected({ type: "tank" });
        }
    };

    $("eco-compost-card").onclick = () => {
        if (twin3D) {
            twin3D.setCameraPreset("compost");
            handleObjectSelected({ type: "compost" });
        }
    };

    // Export JSON
    $("btn-export-json").onclick = () => {
        if (!currentSnapshot) return;
        const blob = new Blob([JSON.stringify(currentSnapshot, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `plantpulse-digital-twin-step-${currentSnapshot.state.step}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    $("btn-refresh-data").onclick = refreshState;
}

// -------------------------------------------------------------
// Camera Viewport Toolbar
// -------------------------------------------------------------
function setupCameraToolbar() {
    const buttons = document.querySelectorAll(".cam-btn");
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const presetName = btn.dataset.cam;
            if (twin3D) {
                twin3D.setCameraPreset(presetName);
            }
        };
    });
}

// -------------------------------------------------------------
// Tab Navigation
// -------------------------------------------------------------
function setupTabNavigation() {
    const tabs = document.querySelectorAll(".tab-btn");
    const contents = document.querySelectorAll(".tab-content");

    tabs.forEach(tab => {
        tab.onclick = () => {
            tabs.forEach(t => t.classList.remove("active"));
            contents.forEach(c => c.classList.remove("active"));

            tab.classList.add("active");
            const targetId = tab.dataset.tab;
            $(targetId).classList.add("active");
        };
    });
}

// -------------------------------------------------------------
// Machine Learning Info
// -------------------------------------------------------------
async function loadMLInfo() {
    try {
        const info = await api("/api/ml/info");
        const container = $("ml-importance-container");
        if (!container || !info.feature_importances) return;

        const niceNames = {
            "moisture_pct": "Soil Moisture Deficit",
            "area_m2": "Plant Bed Surface Area",
            "light_index": "Solar Light Index",
            "temperature_c": "Ambient Temperature",
            "growth_code": "Crop Phenology Stage",
            "plant_code": "Crop Species Factor"
        };

        const sorted = Object.entries(info.feature_importances).sort((a, b) => b[1] - a[1]);
        container.innerHTML = sorted.map(([k, v]) => `
            <div class="importance-bar-row">
                <span class="importance-label">${niceNames[k] || k}</span>
                <div class="importance-track">
                    <div class="importance-fill" style="width: ${v}%;"></div>
                </div>
                <b style="width: 42px; text-align:right;">${v}%</b>
            </div>
        `).join("");
    } catch (e) {
        console.warn("Failed to load ML details:", e);
    }
}

// -------------------------------------------------------------
// Scenario Simulator (A/B Comparative Experiment)
// -------------------------------------------------------------
function setupScenarioRunner() {
    $("sim-scenario-select").onchange = () => {
        const val = $("sim-scenario-select").value;
        if (val === "heatwave_drought") {
            $("scenario-desc").textContent = "5 consecutive days of extreme 36-40°C heat with zero rainfall. Evaluates water conservation and crop resilience.";
        } else if (val === "monsoon_rain") {
            $("scenario-desc").textContent = "Heavy rainfall monsoon series (8-28mm). Tests rainwater cistern catchment volume and overflow dynamics.";
        } else {
            $("scenario-desc").textContent = "Realistic fluctuating spring climate with alternating sunny intervals and light rainfall.";
        }
    };

    $("btn-run-experiment").onclick = async () => {
        const scenarioKey = $("sim-scenario-select").value;
        const btn = $("btn-run-experiment");
        const span = btn.querySelector("span");
        if (span) span.textContent = "Simulating Twin Parallel Experiment...";
        btn.disabled = true;

        try {
            const data = await api("/api/simulate-comparison", { scenario: scenarioKey });
            latestExperimentData = data;
            displayExperimentResults(data);
        } catch (e) {
            alert("Simulation failed: " + e.message);
        } finally {
            if (span) span.textContent = "Run Side-by-Side Simulation ⚡";
            btn.disabled = false;
        }
    };

    $("btn-export-experiment").onclick = () => {
        if (!latestExperimentData) return;
        const timeline = latestExperimentData.timeline || [];
        const rows = [
            ["Step", "Temp_C", "Rain_mm", "Baseline_Freshwater_L", "Circular_Freshwater_L", "Circular_Rain_Used_L", "Baseline_Crop_Health", "Circular_Crop_Health"]
        ];
        timeline.forEach(t => {
            rows.push([
                t.step,
                t.weather.temperature_c,
                t.weather.rainfall_mm,
                t.baseline.freshwater_l,
                t.circular.freshwater_l,
                t.circular.rainwater_used_l,
                t.baseline.plant_health_pct,
                t.circular.plant_health_pct
            ]);
        });

        const csvContent = rows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `plantpulse-scenario-${latestExperimentData.scenario_key}-audit.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };
}

function displayExperimentResults(data) {
    const s = data.summary;
    setTxt("exp-base-fresh", `${fmt(s.baseline_total_freshwater_l)} L`);
    setTxt("exp-base-waste", `${fmt(data.timeline.length * 0.35, 1)} kg`);
    setTxt("exp-base-cost", `$${fmt(s.baseline_total_freshwater_l * 0.008, 2)}`);
    setTxt("exp-base-health", `${fmt(s.final_health_baseline)}%`);

    setTxt("exp-circ-fresh", `${fmt(s.circular_total_freshwater_l)} L (${fmt(s.water_savings_pct)}% saved)`);
    setTxt("exp-circ-rain", `${fmt(s.rainwater_harvested_reused_l)} L`);
    setTxt("exp-circ-compost", `${fmt(s.waste_composted_kg, 1)} kg (${fmt(s.waste_recovery_pct)}%)`);
    setTxt("exp-circ-cost", `$${fmt(s.circular_total_freshwater_l * 0.008, 2)}`);
    setTxt("exp-circ-health", `${fmt(s.final_health_circular)}%`);

    $("experiment-summary").style.display = "grid";
    $("chart-container").style.display = "block";
    $("btn-export-experiment").style.display = "block";

    renderComparisonChart(data.timeline);
}

function renderComparisonChart(timeline) {
    const ctx = $("comparisonChart").getContext("2d");
    const labels = timeline.map(t => `Step ${t.step}`);
    const baselineFresh = timeline.map(t => t.baseline.freshwater_l);
    const circularFresh = timeline.map(t => t.circular.freshwater_l);
    const circularRain = timeline.map(t => t.circular.rainwater_used_l);

    if (comparisonChart) {
        comparisonChart.destroy();
    }

    if (typeof Chart !== 'undefined') {
        comparisonChart = new Chart(ctx, {
            type: "line",
            data: {
                labels: labels,
                datasets: [
                    {
                        label: "Conventional Tap Water (L)",
                        data: baselineFresh,
                        borderColor: "#ef4444",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        tension: 0.3,
                        borderWidth: 2
                    },
                    {
                        label: "Circular Freshwater (L)",
                        data: circularFresh,
                        borderColor: "#10b981",
                        backgroundColor: "rgba(16, 185, 129, 0.15)",
                        tension: 0.3,
                        borderWidth: 2
                    },
                    {
                        label: "Rainwater Reused (L)",
                        data: circularRain,
                        borderColor: "#06b6d4",
                        backgroundColor: "rgba(6, 182, 212, 0.15)",
                        tension: 0.3,
                        borderWidth: 2
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "top",
                        labels: { color: "#cbd5e1", boxWidth: 12, font: { size: 10 } }
                    }
                },
                scales: {
                    x: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8", font: { size: 9 } }
                    },
                    y: {
                        grid: { color: "rgba(255, 255, 255, 0.05)" },
                        ticks: { color: "#94a3b8", font: { size: 9 } },
                        title: { display: true, text: "Cumulative Litres (L)", color: "#94a3b8", font: { size: 9 } }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------
// MQTT Console & Message Streaming
// -------------------------------------------------------------
function setupMqttConsole() {
    $("btn-mqtt-publish").onclick = async () => {
        const topic = $("mqtt-pub-topic").value.trim();
        let payload;
        try {
            payload = JSON.parse($("mqtt-pub-payload").value);
        } catch {
            payload = $("mqtt-pub-payload").value;
        }

        try {
            await api("/api/mqtt/publish", { topic, payload });
            await pollMqttMessages();
        } catch (e) {
            alert("MQTT Publish failed: " + e.message);
        }
    };
}

async function pollMqttMessages() {
    try {
        const data = await api("/api/mqtt/messages?limit=25");
        const status = data.status || {};
        setTxt("mqtt-broker-host", status.broker || "broker.emqx.io:1883");

        const pill = $("mqtt-conn-pill");
        if (status.connected) {
            pill.textContent = "CONNECTED";
            pill.style.background = "rgba(16, 185, 129, 0.15)";
            pill.style.color = "#34d399";
        } else {
            pill.textContent = "STANDBY / VIRTUAL";
            pill.style.background = "rgba(245, 158, 11, 0.15)";
            pill.style.color = "#fbbf24";
        }

        const logsContainer = $("mqtt-console-logs");
        if (data.messages && data.messages.length > 0) {
            logsContainer.innerHTML = data.messages.map(m => {
                const payloadStr = typeof m.payload === "object" ? JSON.stringify(m.payload) : String(m.payload);
                return `
                    <div class="log-entry">
                        <span class="log-time">[${m.timestamp}]</span>
                        <span class="log-topic">${m.topic}</span>
                        <span class="log-payload">${payloadStr}</span>
                    </div>
                `;
            }).join("");
        } else {
            logsContainer.innerHTML = `<div style="color:var(--text-dim); text-align:center; margin-top:2rem;">Awaiting telemetry messages on MQTT bus...</div>`;
        }
    } catch (e) {
        // Silent failure on polling error
    }
}
