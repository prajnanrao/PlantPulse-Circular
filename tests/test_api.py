from backend.app import app

def test_health():
    client = app.test_client()
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json["status"] == "ok"
    assert "mqtt" in r.json

def test_bad_mode():
    client = app.test_client()
    assert client.post("/api/mode", json={"mode": "invalid"}).status_code == 400

def test_state_and_step():
    client = app.test_client()
    r_state = client.get("/api/state")
    assert r_state.status_code == 200
    assert "predictions_l_by_bed" in r_state.json
    assert "sustainability" in r_state.json

    r_step = client.post("/api/step", json={"inputs": {"temperature_c": 30.0, "rainfall_mm": 5.0}})
    assert r_step.status_code == 200
    assert r_step.json["state"]["step"] >= 1

def test_ml_info_endpoint():
    client = app.test_client()
    r = client.get("/api/ml/info")
    assert r.status_code == 200
    data = r.json
    assert "feature_importances" in data
    assert "r2_score" in data
    assert data["r2_score"] > 0.90
    assert "comparisons" in data

def test_scenario_comparison():
    client = app.test_client()
    r_scenarios = client.get("/api/scenarios")
    assert r_scenarios.status_code == 200
    assert len(r_scenarios.json["scenarios"]) >= 3

    r_sim = client.post("/api/simulate-comparison", json={"scenario": "heatwave_drought"})
    assert r_sim.status_code == 200
    data = r_sim.json
    assert "timeline" in data
    assert "summary" in data
    assert data["summary"]["water_saved_l"] >= 0

def test_mqtt_endpoints():
    client = app.test_client()
    r_msg = client.get("/api/mqtt/messages")
    assert r_msg.status_code == 200
    assert "messages" in r_msg.json

    r_pub = client.post("/api/mqtt/publish", json={"topic": "test/topic", "payload": {"foo": "bar"}})
    assert r_pub.status_code == 200
