from backend.simulation import initial_state,advance,sustainability
def test_advance_updates_state():
    s=advance(initial_state(),{"temperature_c":34,"rainfall_mm":10},"circular")
    assert s["step"]==1 and s["weather"]["temperature_c"]==34 and s["tank_l"]>180
def test_metrics_valid():
    s=initial_state()
    for _ in range(8): s=advance(s,{"rainfall_mm":3},"circular")
    m=sustainability(s); assert 0<=m["organic_waste_recovery_pct"]<=100 and m["freshwater_used_l"]>=0
def test_baseline_uses_freshwater():
    s=advance(initial_state(),{"rainfall_mm":10},"baseline")
    assert s["cumulative"]["rainwater_used_l"]==0 and s["cumulative"]["freshwater_l"]>0
