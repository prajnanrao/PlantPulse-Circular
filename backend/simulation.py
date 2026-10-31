from copy import deepcopy
from .config import CONFIG

DEFAULT_STATE = {
    "step": 0,
    "weather": {"temperature_c": 28.0, "light_index": 0.70, "rainfall_mm": 0.0},
    "beds": [
        {
            "id": "bed-1",
            "plant": "Tomato",
            "moisture_pct": 38.0,
            "health_pct": 88.0,
            "growth_stage": "vegetative",
            "area_m2": 4.0,
            "soil_temp_c": 26.2,
            "wilting_index": 0.12,
            "last_watered_l": 0.0
        },
        {
            "id": "bed-2",
            "plant": "Basil",
            "moisture_pct": 44.0,
            "health_pct": 93.0,
            "growth_stage": "vegetative",
            "area_m2": 3.0,
            "soil_temp_c": 25.8,
            "wilting_index": 0.05,
            "last_watered_l": 0.0
        },
        {
            "id": "bed-3",
            "plant": "Spinach",
            "moisture_pct": 33.0,
            "health_pct": 84.0,
            "growth_stage": "growing",
            "area_m2": 5.0,
            "soil_temp_c": 26.5,
            "wilting_index": 0.20,
            "last_watered_l": 0.0
        }
    ],
    "tank_l": 180.0,
    "tank_capacity_l": CONFIG.get("tank_capacity_l", 500.0),
    "tank_fill_pct": round(180.0 / CONFIG.get("tank_capacity_l", 500.0) * 100, 1),
    "organic_waste_kg": 4.0,
    "composting_batches": [],
    "compost_ready_kg": 1.0,
    "compost_pile_temp_c": 48.5,
    "cumulative": {
        "freshwater_l": 0.0,
        "rainwater_used_l": 0.0,
        "water_used_l": 0.0,
        "organic_waste_generated_kg": 4.0,
        "organic_waste_composted_kg": 0.0,
        "compost_applied_kg": 0.0,
        "pump_energy_kwh": 0.0,
        "cost_units": 0.0,
        "avoided_emissions_kg_co2e": 0.0
    },
    "last_action": {
        "irrigation_l": 0.0,
        "source": "none",
        "message": "Digital Twin initialized. Ready to simulate."
    }
}

def initial_state():
    return deepcopy(DEFAULT_STATE)

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def advance(state, inputs=None, mode="circular", irrigation_l=None):
    s = deepcopy(state)
    inputs = inputs or {}
    s["step"] += 1
    w = s["weather"]

    # Weather dynamics
    w["temperature_c"] = float(inputs.get("temperature_c", w["temperature_c"]))
    w["light_index"] = clamp(float(inputs.get("light_index", w["light_index"])), 0.0, 1.0)
    w["rainfall_mm"] = max(0.0, float(inputs.get("rainfall_mm", 0.0)))

    # Rainwater harvesting into tank
    rain_captured_l = w["rainfall_mm"] * CONFIG["bed_area_m2"] * CONFIG["rain_capture_efficiency"]
    s["tank_l"] = min(CONFIG["tank_capacity_l"], s["tank_l"] + rain_captured_l)
    s["tank_fill_pct"] = round((s["tank_l"] / CONFIG["tank_capacity_l"]) * 100, 1)

    # Compost batches lifecycle
    matured = 0.0
    pending = []
    for batch in s.get("composting_batches", []):
        batch["steps_left"] -= 1
        if batch["steps_left"] <= 0:
            matured += batch["kg"]
        else:
            pending.append(batch)
    s["composting_batches"] = pending
    s["compost_ready_kg"] += matured

    # Plant biomass waste generation (pruning / shedding)
    waste = 0.35
    s["organic_waste_kg"] += waste
    s["cumulative"]["organic_waste_generated_kg"] += waste

    composted = 0.0
    if mode == "circular" and s["organic_waste_kg"] >= 0.5:
        composted = min(0.5, s["organic_waste_kg"])
        s["organic_waste_kg"] -= composted
        s["composting_batches"].append({
            "kg": composted * 0.65,
            "steps_left": CONFIG["compost_maturity_steps"]
        })
        s["cumulative"]["organic_waste_composted_kg"] += composted

    # Aerobic decomposition internal thermal physics
    if len(s["composting_batches"]) > 0:
        s["compost_pile_temp_c"] = round(min(58.0, 35.0 + len(s["composting_batches"]) * 6.5 + w["temperature_c"] * 0.25), 1)
    else:
        s["compost_pile_temp_c"] = round(max(22.0, w["temperature_c"] * 0.9), 1)

    # Irrigation demand calculation per bed
    demand = 0.0
    for b in s["beds"]:
        deficit = max(0.0, 58.0 - b["moisture_pct"])
        bed_demand = (
            deficit
            * b["area_m2"]
            * 0.12
            * max(0.65, 1.0 + (w["temperature_c"] - 25.0) * 0.015)
            * (0.7 + w["light_index"] * 0.6)
        )
        demand += bed_demand
    demand = min(CONFIG["max_irrigation_l_per_step"], demand)

    # Actuator execution based on mode
    if mode == "baseline":
        # Conventional linear: fixed schedule freshwater tap, no compost application
        actual = CONFIG["baseline_fixed_irrigation_l_per_step"] if irrigation_l is None else max(0.0, float(irrigation_l))
        rain_used = 0.0
        fresh = actual
        applied = 0.0
    else:
        # Circular digital twin: precision demand, rainwater prioritized, organic compost applied
        desired = demand if irrigation_l is None else max(0.0, float(irrigation_l))
        actual = min(desired, CONFIG["max_irrigation_l_per_step"])
        rain_used = min(s["tank_l"], actual)
        fresh = max(0.0, actual - rain_used)
        s["tank_l"] -= rain_used
        s["tank_fill_pct"] = round((s["tank_l"] / CONFIG["tank_capacity_l"]) * 100, 1)
        applied = min(0.10, s["compost_ready_kg"])
        s["compost_ready_kg"] -= applied
        s["cumulative"]["compost_applied_kg"] += applied

    # Update individual beds
    for b in s["beds"]:
        share = b["area_m2"] / CONFIG["bed_area_m2"]
        bed_water = actual * share
        b["last_watered_l"] = round(bed_water, 2)
        added = bed_water / max(0.1, b["area_m2"]) * 2.0
        
        # Evapotranspiration
        evaporation = (0.8 + max(0.0, w["temperature_c"] - 20.0) * 0.05) * (0.7 + w["light_index"] * 0.6)
        
        # Soil moisture transition
        b["moisture_pct"] = round(clamp(b["moisture_pct"] + added - evaporation, 5.0, 95.0), 1)
        
        # Soil temperature (damp soil stays cooler)
        moisture_cooling = (b["moisture_pct"] / 100.0) * 4.0
        b["soil_temp_c"] = round(w["temperature_c"] - moisture_cooling + 1.2, 1)

        # Plant health & wilting index
        if b["moisture_pct"] < 25.0:
            health_delta = -2.5
            b["wilting_index"] = round(clamp(b.get("wilting_index", 0.0) + 0.15, 0.0, 1.0), 2)
        elif b["moisture_pct"] >= 35.0:
            health_delta = 0.5
            b["wilting_index"] = round(clamp(b.get("wilting_index", 0.0) - 0.10, 0.0, 1.0), 2)
        else:
            health_delta = 0.0
            b["wilting_index"] = round(clamp(b.get("wilting_index", 0.0), 0.0, 1.0), 2)

        b["health_pct"] = round(clamp(b["health_pct"] + health_delta, 20.0, 100.0), 1)

    # Cumulative sustainability accounting
    c = s["cumulative"]
    energy = actual * CONFIG["pump_energy_kwh_per_l"]
    c["freshwater_l"] += fresh
    c["rainwater_used_l"] += rain_used
    c["water_used_l"] += actual
    c["pump_energy_kwh"] += energy
    c["cost_units"] += fresh * CONFIG["freshwater_cost_per_l"]

    # Avoided emissions: avoided municipal tap treatment (0.3g CO2/L) + fertilizer offset from compost (1.2 kg CO2/kg compost)
    avoided_tap_co2 = rain_used * CONFIG["freshwater_emission_kg_per_l"]
    avoided_fertilizer_co2 = applied * 1.2
    c["avoided_emissions_kg_co2e"] += avoided_tap_co2 + avoided_fertilizer_co2

    source_str = (
        "rainwater + freshwater" if (rain_used > 0 and fresh > 0)
        else "rainwater" if rain_used > 0
        else "freshwater" if fresh > 0
        else "none"
    )

    s["last_action"] = {
        "irrigation_l": round(actual, 2),
        "source": source_str,
        "predicted_demand_l": round(demand, 2),
        "rainwater_used_l": round(rain_used, 2),
        "freshwater_used_l": round(fresh, 2),
        "composted_kg": round(composted, 2),
        "compost_applied_kg": round(applied, 2),
        "message": f"{mode.title()} scenario advanced by one simulated six-hour interval."
    }
    return s

def sustainability(state, mode="circular"):
    c = state["cumulative"]
    baseline = state["step"] * CONFIG["baseline_fixed_irrigation_l_per_step"]
    saved = max(0.0, baseline - c["freshwater_l"])
    eligible = c["organic_waste_generated_kg"]
    recovery = min(100.0, 100.0 * c["organic_waste_composted_kg"] / eligible) if eligible else 0.0
    emissions = (
        c["freshwater_l"] * CONFIG["freshwater_emission_kg_per_l"]
        + c["pump_energy_kwh"] * CONFIG["grid_emission_kg_per_kwh"]
    )
    baseline_emissions = (
        baseline * CONFIG["freshwater_emission_kg_per_l"]
        + baseline * CONFIG["pump_energy_kwh_per_l"] * CONFIG["grid_emission_kg_per_kwh"]
    )
    net_emissions_avoided = max(0.0, baseline_emissions - emissions + c.get("avoided_emissions_kg_co2e", 0.0))

    return {
        "baseline_freshwater_l": round(baseline, 2),
        "freshwater_used_l": round(c["freshwater_l"], 2),
        "freshwater_saved_l_vs_fixed_baseline": round(saved, 2),
        "freshwater_savings_pct_vs_fixed_baseline": round(100.0 * saved / baseline, 2) if baseline else 0.0,
        "rainwater_reused_l": round(c["rainwater_used_l"], 2),
        "total_water_used_l": round(c["water_used_l"], 2),
        "organic_waste_generated_kg": round(eligible, 2),
        "organic_waste_composted_kg": round(c["organic_waste_composted_kg"], 2),
        "organic_waste_recovery_pct": round(recovery, 2),
        "compost_ready_kg": round(state["compost_ready_kg"], 2),
        "compost_applied_kg": round(c["compost_applied_kg"], 2),
        "pump_energy_kwh_est": round(c["pump_energy_kwh"], 4),
        "estimated_emissions_kg_co2e": round(emissions, 4),
        "avoided_emissions_kg_co2e": round(net_emissions_avoided, 4),
        "estimated_water_cost_units": round(c["cost_units"], 4),
        "estimated_cost_saved_units": round(saved * CONFIG["freshwater_cost_per_l"], 4),
        "average_plant_health_pct": round(sum(b["health_pct"] for b in state["beds"]) / len(state["beds"]), 1),
        "assumptions": [
            "All weather, plant, and waste data are simulated, not measured.",
            "Water mass balance captures rainfall via roof catchment at 80% efficiency.",
            "Compost dynamics simulate aerobic thermophilic decomposition.",
            "Emissions factors: 0.3g CO2e/L freshwater, 0.70 kg CO2e/kWh grid electricity.",
            "Avoided emissions include chemical fertilizer offset and municipal water pumping."
        ]
    }

# Preset scenarios for side-by-side comparative simulation
PRESET_SCENARIOS = {
    "heatwave_drought": {
        "name": "Summer Heatwave & Drought",
        "description": "5 consecutive days (20 steps) of extreme 36-40°C heat with zero rainfall.",
        "steps": [
            {"temperature_c": 34.0, "light_index": 0.85, "rainfall_mm": 0.0},
            {"temperature_c": 36.5, "light_index": 0.95, "rainfall_mm": 0.0},
            {"temperature_c": 38.0, "light_index": 1.00, "rainfall_mm": 0.0},
            {"temperature_c": 39.5, "light_index": 0.95, "rainfall_mm": 0.0},
            {"temperature_c": 37.0, "light_index": 0.90, "rainfall_mm": 0.0},
            {"temperature_c": 35.0, "light_index": 0.85, "rainfall_mm": 0.0},
            {"temperature_c": 38.5, "light_index": 0.95, "rainfall_mm": 0.0},
            {"temperature_c": 40.0, "light_index": 1.00, "rainfall_mm": 0.0},
            {"temperature_c": 37.5, "light_index": 0.90, "rainfall_mm": 0.0},
            {"temperature_c": 36.0, "light_index": 0.85, "rainfall_mm": 0.0},
            {"temperature_c": 35.5, "light_index": 0.80, "rainfall_mm": 0.0},
            {"temperature_c": 34.0, "light_index": 0.75, "rainfall_mm": 0.0}
        ]
    },
    "monsoon_rain": {
        "name": "Monsoon Deluge & Storm",
        "description": "Heavy rainfall events testing rainwater tank harvesting and overflow management.",
        "steps": [
            {"temperature_c": 24.0, "light_index": 0.40, "rainfall_mm": 8.0},
            {"temperature_c": 22.5, "light_index": 0.25, "rainfall_mm": 22.0},
            {"temperature_c": 21.0, "light_index": 0.20, "rainfall_mm": 28.0},
            {"temperature_c": 23.0, "light_index": 0.35, "rainfall_mm": 15.0},
            {"temperature_c": 25.0, "light_index": 0.60, "rainfall_mm": 2.0},
            {"temperature_c": 26.5, "light_index": 0.75, "rainfall_mm": 0.0},
            {"temperature_c": 24.0, "light_index": 0.40, "rainfall_mm": 18.0},
            {"temperature_c": 22.0, "light_index": 0.25, "rainfall_mm": 25.0},
            {"temperature_c": 23.5, "light_index": 0.45, "rainfall_mm": 10.0},
            {"temperature_c": 26.0, "light_index": 0.70, "rainfall_mm": 0.0},
            {"temperature_c": 27.0, "light_index": 0.80, "rainfall_mm": 0.0},
            {"temperature_c": 26.0, "light_index": 0.75, "rainfall_mm": 0.0}
        ]
    },
    "seasonal_spring": {
        "name": "Variable Spring Season",
        "description": "Realistic fluctuating temperature, occasional gentle showers, and active plant growth.",
        "steps": [
            {"temperature_c": 22.0, "light_index": 0.65, "rainfall_mm": 0.0},
            {"temperature_c": 24.5, "light_index": 0.80, "rainfall_mm": 0.0},
            {"temperature_c": 21.0, "light_index": 0.45, "rainfall_mm": 6.5},
            {"temperature_c": 23.0, "light_index": 0.70, "rainfall_mm": 1.2},
            {"temperature_c": 26.0, "light_index": 0.85, "rainfall_mm": 0.0},
            {"temperature_c": 27.5, "light_index": 0.90, "rainfall_mm": 0.0},
            {"temperature_c": 25.0, "light_index": 0.75, "rainfall_mm": 0.0},
            {"temperature_c": 20.5, "light_index": 0.35, "rainfall_mm": 12.0},
            {"temperature_c": 22.0, "light_index": 0.55, "rainfall_mm": 4.0},
            {"temperature_c": 25.5, "light_index": 0.80, "rainfall_mm": 0.0},
            {"temperature_c": 28.0, "light_index": 0.90, "rainfall_mm": 0.0},
            {"temperature_c": 27.0, "light_index": 0.85, "rainfall_mm": 0.0}
        ]
    }
}

def run_comparative_experiment(scenario_key="heatwave_drought"):
    """
    Executes a side-by-side run of Conventional (Baseline) and Circular Digital Twin
    starting from identical initial state and facing the exact same weather series.
    """
    scenario = PRESET_SCENARIOS.get(scenario_key, PRESET_SCENARIOS["heatwave_drought"])
    steps_data = scenario["steps"]

    s_baseline = initial_state()
    s_circular = initial_state()

    timeline = []

    for idx, weather_input in enumerate(steps_data):
        s_baseline = advance(s_baseline, weather_input, mode="baseline")
        s_circular = advance(s_circular, weather_input, mode="circular")

        sus_b = sustainability(s_baseline, mode="baseline")
        sus_c = sustainability(s_circular, mode="circular")

        timeline.append({
            "step": idx + 1,
            "weather": weather_input,
            "baseline": {
                "freshwater_l": sus_b["freshwater_used_l"],
                "rainwater_used_l": sus_b["rainwater_reused_l"],
                "plant_health_pct": sus_b["average_plant_health_pct"],
                "waste_composted_kg": sus_b["organic_waste_composted_kg"],
                "emissions_kg_co2e": sus_b["estimated_emissions_kg_co2e"],
                "cost_units": sus_b["estimated_water_cost_units"],
                "tank_l": s_baseline["tank_l"]
            },
            "circular": {
                "freshwater_l": sus_c["freshwater_used_l"],
                "rainwater_used_l": sus_c["rainwater_reused_l"],
                "plant_health_pct": sus_c["average_plant_health_pct"],
                "waste_composted_kg": sus_c["organic_waste_composted_kg"],
                "emissions_kg_co2e": sus_c["estimated_emissions_kg_co2e"],
                "avoided_co2e": sus_c["avoided_emissions_kg_co2e"],
                "cost_units": sus_c["estimated_water_cost_units"],
                "tank_l": s_circular["tank_l"]
            }
        })

    final_sus_b = sustainability(s_baseline, mode="baseline")
    final_sus_c = sustainability(s_circular, mode="circular")

    water_saved_l = max(0.0, final_sus_b["freshwater_used_l"] - final_sus_c["freshwater_used_l"])
    savings_pct = round(100.0 * water_saved_l / final_sus_b["freshwater_used_l"], 1) if final_sus_b["freshwater_used_l"] > 0 else 0.0

    return {
        "scenario_key": scenario_key,
        "scenario_name": scenario["name"],
        "description": scenario["description"],
        "total_steps": len(steps_data),
        "timeline": timeline,
        "summary": {
            "baseline_total_freshwater_l": final_sus_b["freshwater_used_l"],
            "circular_total_freshwater_l": final_sus_c["freshwater_used_l"],
            "water_saved_l": round(water_saved_l, 2),
            "water_savings_pct": savings_pct,
            "rainwater_harvested_reused_l": final_sus_c["rainwater_reused_l"],
            "waste_composted_kg": final_sus_c["organic_waste_composted_kg"],
            "waste_recovery_pct": final_sus_c["organic_waste_recovery_pct"],
            "cost_saved_units": round(final_sus_b["estimated_water_cost_units"] - final_sus_c["estimated_water_cost_units"], 3),
            "emissions_avoided_kg_co2e": final_sus_c["avoided_emissions_kg_co2e"],
            "final_health_baseline": final_sus_b["average_plant_health_pct"],
            "final_health_circular": final_sus_c["average_plant_health_pct"]
        }
    }
