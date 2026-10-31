# Research Methodology & Agronomic Equations

## 1. Research Question
How can a virtual digital twin coordinate multi-loop circular resources—specifically rainwater harvesting, aerobic organic waste bio-conversion, and Machine Learning predictive irrigation—to minimize freshwater extraction and greenhouse gas emissions while preserving crop physiological health?

---

## 2. Mass & Energy Balance Governing Equations

### 2.1 Water Catchment & Storage Dynamics
Rainfall volume collected from roof catchment area ($A_{\text{roof}} = 12\text{ m}^2$):
$$V_{\text{harvested}} = R_{\text{mm}} \times A_{\text{roof}} \times \eta_{\text{capture}}$$
Where $\eta_{\text{capture}} = 0.80$ accounts for surface wetting losses and gutter spillage.

Storage mass conservation in the cistern:
$$V_{\text{tank}}(t+1) = \min\left(V_{\text{capacity}}, V_{\text{tank}}(t) + V_{\text{harvested}}(t) - V_{\text{rain\_used}}(t)\right)$$

### 2.2 Crop Evapotranspiration & Irrigation Deficit
Evapotranspiration rate $ET_c$ is determined by reference solar radiation, temperature, and crop coefficients:
$$ET_c = \left(0.8 + \max(0, T_{\text{air}} - 20) \times 0.05\right) \times \left(0.7 + I_{\text{light}} \times 0.6\right)$$

Soil moisture deficit to optimal field capacity ($\theta_{\text{target}} = 58\%$):
$$\Delta \theta = \max(0, 58 - \theta_{\text{moisture}})$$

Per-bed calculated water demand:
$$D_{\text{bed}} = \Delta \theta \times A_{\text{bed}} \times 0.12 \times \max\left(0.65, 1 + (T_{\text{air}} - 25) \times 0.015\right) \times (0.7 + I_{\text{light}} \times 0.6) \times K_c$$

Where $K_c$ represents crop-specific transpiration factors ($K_c = 1.05$ for Tomato, $0.75$ for Basil, $0.90$ for Spinach).

### 2.3 Aerobic Biomass Thermophilic Composting
Biomass generated through pruning and crop senescence:
$$W_{\text{gen}} = 0.35\text{ kg per 6-hour interval}$$
In circular mode, batches are routed to the aerobic bioreactor. Each batch undergoes aerobic thermophilic breakdown over 3 maturation intervals ($18\text{ hours}$ simulated), converting mass at a $65\%$ humus yield:
$$M_{\text{compost}} = W_{\text{composted}} \times 0.65$$

Internal pile temperature tracks microbial activity:
$$T_{\text{pile}} = \min(58^\circ\text{C}, 35^\circ\text{C} + N_{\text{batches}} \times 6.5^\circ\text{C} + T_{\text{air}} \times 0.25)$$

---

## 3. Life Cycle Carbon Accounting (LCA)

Avoided greenhouse gas emissions are calculated using published LCA coefficients:
1. **Municipal Water Avoidance:** $0.0003\text{ kg CO}_2\text{e/L}$ ($0.3\text{ g/L}$) based on typical surface/groundwater treatment and pressurized distribution energy.
2. **Synthetic Fertilizer Offset:** $1.2\text{ kg CO}_2\text{e/kg}$ of mature organic compost applied, replacing synthetic Haber-Bosch nitrogen and phosphorus fertilizers.
3. **Pumping Grid Emissions:** $0.70\text{ kg CO}_2\text{e/kWh}$ applied to solar booster pump energy ($0.00035\text{ kWh/L}$).

$$\text{Net Avoided Emissions} = \left(V_{\text{rain\_used}} \times 0.0003\right) + \left(M_{\text{compost\_applied}} \times 1.2\right) - \left(E_{\text{pump}} \times 0.70\right)$$

---

## 4. Machine Learning Model Architecture & Validation

- **Algorithm:** Random Forest Regressor (120 Estimators, minimum leaf samples = 2).
- **Features:** $\left[\theta_{\text{moisture}}, T_{\text{air}}, I_{\text{light}}, A_{\text{bed}}, \text{Crop Code}, \text{Phenology Code}\right]$.
- **Training Set:** 4,000 synthetic microclimate observations (80/20 train/test split).
- **Metrics on Held-Out Validation Split:**
  - $R^2 \text{ Score} = 0.9688$
  - $\text{Mean Absolute Error (MAE)} = 0.799\text{ Liters}$
  - $\text{Root Mean Squared Error (RMSE)} = 1.328\text{ Liters}$
  - Fixed-Timer Baseline $\text{MAE} = 6.500\text{ Liters}$
  - Rule-Based Threshold $\text{MAE} = 3.273\text{ Liters}$
