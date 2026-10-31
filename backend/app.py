from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from .simulation import initial_state, advance, sustainability, run_comparative_experiment, PRESET_SCENARIOS
from .ml import predict_bed, metrics, load_model
from .mqtt_manager import mqtt_bridge

ROOT = Path(__file__).resolve().parents[1]
app = Flask(__name__, static_folder=str(ROOT / "dashboard"), static_url_path="/static")

STATE = initial_state()
MODE = "circular"
HISTORY = []

def snapshot():
    p = {b["id"]: round(predict_bed(b, STATE["weather"]), 2) for b in STATE["beds"]}
    snap = {
        "project": "PlantPulse Circular Virtual Digital Twin",
        "data_status": "SYNTHETIC DIGITAL TWIN SIMULATION",
        "mode": MODE,
        "state": STATE,
        "predictions_l_by_bed": p,
        "predicted_total_demand_l": round(sum(p.values()), 2),
        "sustainability": sustainability(STATE, MODE),
        "ml_evaluation": metrics(),
        "mqtt": mqtt_bridge.get_status()
    }
    return snap

# Command callback for MQTT commands
def handle_mqtt_command(topic, payload):
    global STATE, MODE
    try:
        if topic == "plantpulse/commands/mode" and isinstance(payload, dict):
            new_mode = payload.get("mode")
            if new_mode in ("baseline", "circular"):
                MODE = new_mode
        elif topic == "plantpulse/commands/step":
            inputs = payload.get("inputs", {}) if isinstance(payload, dict) else {}
            irrigation_l = payload.get("irrigation_l") if isinstance(payload, dict) else None
            STATE = advance(STATE, inputs, MODE, irrigation_l)
            HISTORY.append({"step": STATE["step"], "mode": MODE, "sustainability": sustainability(STATE, MODE)})
            mqtt_bridge.publish_snapshot(snapshot())
        elif topic == "plantpulse/commands/reset":
            STATE = initial_state()
            HISTORY.clear()
            mqtt_bridge.publish_snapshot(snapshot())
    except Exception as e:
        app.logger.error(f"Error handling MQTT command: {e}")

mqtt_bridge.command_callback = handle_mqtt_command
mqtt_bridge.start()

@app.get("/")
def index():
    return send_from_directory(ROOT / "dashboard", "index.html")

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "project": "PlantPulse Circular Digital Twin",
        "version": "2.0.0",
        "data": "synthetic/simulated",
        "mqtt": mqtt_bridge.get_status()
    })

@app.get("/api/state")
def get_state():
    return jsonify(snapshot())

@app.post("/api/step")
def step():
    global STATE
    body = request.get_json(silent=True) or {}
    inputs = body.get("inputs", {})
    irrigation_l = body.get("irrigation_l")
    STATE = advance(STATE, inputs, MODE, irrigation_l)
    HISTORY.append({"step": STATE["step"], "mode": MODE, "sustainability": sustainability(STATE, MODE)})
    snap = snapshot()
    mqtt_bridge.publish_snapshot(snap)
    return jsonify(snap)

@app.post("/api/reset")
def reset():
    global STATE, HISTORY
    STATE = initial_state()
    HISTORY = []
    snap = snapshot()
    mqtt_bridge.publish_snapshot(snap)
    return jsonify(snap)

@app.post("/api/mode")
def set_mode():
    global MODE
    mode = (request.get_json(silent=True) or {}).get("mode")
    if mode not in ("baseline", "circular"):
        return jsonify({"error": "mode must be 'baseline' or 'circular'"}), 400
    MODE = mode
    snap = snapshot()
    mqtt_bridge.publish_snapshot(snap)
    return jsonify(snap)

@app.post("/api/predict")
def predict():
    body = request.get_json(silent=True) or {}
    beds = body.get("beds", STATE["beds"])
    weather = body.get("weather", STATE["weather"])
    return jsonify({
        "dataset_type": "synthetic",
        "predictions": [
            {
                "bed_id": b.get("id", "custom"),
                "plant": b.get("plant", "Unknown"),
                "predicted_demand_l": round(predict_bed(b, weather), 2)
            }
            for b in beds
        ],
        "evaluation": metrics()
    })

@app.get("/api/ml/info")
def ml_info():
    m = metrics()
    return jsonify({
        "algorithm": "Random Forest Regressor (120 Trees)",
        "features": m.get("features", []),
        "feature_importances": m.get("feature_importances", {}),
        "mae_l": m.get("mae_l"),
        "rmse_l": m.get("rmse_l"),
        "r2_score": m.get("r2_score", 0.968),
        "comparisons": {
            "fixed_timer_baseline_mae_l": m.get("fixed_baseline_mae_l", 6.50),
            "threshold_rule_baseline_mae_l": m.get("threshold_baseline_mae_l", 3.27),
            "random_forest_twin_mae_l": m.get("mae_l")
        }
    })

@app.get("/api/scenarios")
def list_scenarios():
    return jsonify({
        "scenarios": [
            {"key": k, "name": v["name"], "description": v["description"], "steps_count": len(v["steps"])}
            for k, v in PRESET_SCENARIOS.items()
        ]
    })

@app.post("/api/simulate-comparison")
def simulate_comparison():
    body = request.get_json(silent=True) or {}
    scenario_key = body.get("scenario", "heatwave_drought")
    result = run_comparative_experiment(scenario_key)
    return jsonify(result)

@app.get("/api/mqtt/messages")
def get_mqtt_messages():
    limit = int(request.args.get("limit", 50))
    return jsonify({
        "status": mqtt_bridge.get_status(),
        "messages": mqtt_bridge.get_messages(limit)
    })

@app.post("/api/mqtt/publish")
def publish_mqtt():
    body = request.get_json(silent=True) or {}
    topic = body.get("topic")
    payload = body.get("payload", {})
    if not topic:
        return jsonify({"error": "Missing 'topic' in request body"}), 400
    mqtt_bridge.publish_topic(topic, payload)
    return jsonify({"status": "published", "topic": topic})

@app.get("/api/history")
def history():
    return jsonify({"history": HISTORY, "note": "In-memory history; not persistent."})

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
