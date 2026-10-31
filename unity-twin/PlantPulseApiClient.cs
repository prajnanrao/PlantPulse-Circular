using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;
using TMPro;
[Serializable] public class PlantPulseHealth { public string status; public string project; public string data; }
public class PlantPulseApiClient : MonoBehaviour {
 public string apiBaseUrl="http://127.0.0.1:5000"; public float refreshSeconds=3f; public TMP_Text statusLabel;
 IEnumerator Start(){while(true){using(UnityWebRequest r=UnityWebRequest.Get(apiBaseUrl+"/api/health")){r.timeout=5;yield return r.SendWebRequest();if(statusLabel!=null){if(r.result==UnityWebRequest.Result.Success){var h=JsonUtility.FromJson<PlantPulseHealth>(r.downloadHandler.text);statusLabel.text=h.project+"\nAPI: "+h.status+"\n"+h.data;}else statusLabel.text="API unavailable. Start the Python backend.";}}yield return new WaitForSeconds(refreshSeconds);}}
}
