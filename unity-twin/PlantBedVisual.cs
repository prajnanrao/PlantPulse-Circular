using UnityEngine;
public class PlantBedVisual : MonoBehaviour {
 public Renderer bedRenderer; public Color dryColor=new Color(.70f,.43f,.25f); public Color balancedColor=new Color(.25f,.48f,.30f); public Color wetColor=new Color(.20f,.48f,.65f);
 public void SetMoisture(float moisturePercent){if(bedRenderer==null)bedRenderer=GetComponent<Renderer>();if(bedRenderer==null)return;bedRenderer.material.color=moisturePercent<30?dryColor:moisturePercent<65?balancedColor:wetColor;}
}
