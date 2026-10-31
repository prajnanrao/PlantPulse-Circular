from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

import warnings
warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MODELS = ROOT / "models"
PATH = MODELS / "irrigation_demand.joblib"

FEATURES = ["moisture_pct", "temperature_c", "light_index", "area_m2", "plant_code", "growth_code"]

def generate_synthetic_dataset(n=4000, seed=42):
    r = np.random.default_rng(seed)
    moisture = r.uniform(10, 85, n)
    temp = r.uniform(12, 42, n)
    light = r.uniform(0.05, 1, n)
    area = r.uniform(1, 6, n)
    plant = r.integers(0, 3, n)
    growth = r.integers(0, 3, n)
    pf = np.choose(plant, [1.05, 0.75, 0.9])
    gf = np.choose(growth, [0.85, 1, 1.15])
    demand = (
        np.maximum(0, 58 - moisture)
        * area
        * 0.12
        * np.maximum(0.65, 1 + (temp - 25) * 0.015)
        * (0.7 + light * 0.6)
        * pf
        * gf
        + r.normal(0, 0.35, n)
    )
    demand = np.clip(demand, 0, 35)
    return pd.DataFrame({
        "moisture_pct": moisture,
        "temperature_c": temp,
        "light_index": light,
        "area_m2": area,
        "plant_code": plant,
        "growth_code": growth,
        "demand_l": demand
    })

def train_model():
    DATA.mkdir(exist_ok=True)
    MODELS.mkdir(exist_ok=True)
    df = generate_synthetic_dataset()
    df.to_csv(DATA / "synthetic_irrigation_training.csv", index=False)
    x = df[FEATURES]
    y = df["demand_l"]
    xt, xv, yt, yv = train_test_split(x, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=120, min_samples_leaf=2, random_state=42, n_jobs=1)
    model.fit(xt, yt)
    pred = model.predict(xv)
    
    # Baseline comparison models on validation set:
    fixed_baseline_pred = np.full_like(yv, 8.0) # Fixed constant timer
    threshold_baseline_pred = np.where(xv["moisture_pct"] < 40, 10.0, 0.0) # Simple rule
    
    importances = dict(zip(FEATURES, [round(float(v) * 100, 1) for v in model.feature_importances_]))
    
    metrics = {
        "dataset_type": "synthetic",
        "rows": len(df),
        "test_rows": len(yv),
        "mae_l": float(round(mean_absolute_error(yv, pred), 3)),
        "rmse_l": float(round(np.sqrt(mean_squared_error(yv, pred)), 3)),
        "r2_score": float(round(r2_score(yv, pred), 4)),
        "fixed_baseline_mae_l": float(round(mean_absolute_error(yv, fixed_baseline_pred), 3)),
        "threshold_baseline_mae_l": float(round(mean_absolute_error(yv, threshold_baseline_pred), 3)),
        "feature_importances": importances,
        "features": FEATURES
    }
    joblib.dump({"model": model, "metrics": metrics, "features": FEATURES}, PATH)
    return metrics

def load_model():
    if not PATH.exists():
        train_model()
    return joblib.load(PATH)

def predict_bed(b, w):
    bundle = load_model()
    pc = {"Tomato": 0, "Basil": 1, "Spinach": 2}
    gc = {"seedling": 0, "vegetative": 1, "growing": 2, "mature": 2}
    row = [[
        b["moisture_pct"],
        w["temperature_c"],
        w["light_index"],
        b["area_m2"],
        pc.get(b["plant"], 0),
        gc.get(b["growth_stage"], 1)
    ]]
    return max(0, min(35, float(bundle["model"].predict(pd.DataFrame(row, columns=FEATURES))[0])))

def metrics():
    return load_model()["metrics"]
