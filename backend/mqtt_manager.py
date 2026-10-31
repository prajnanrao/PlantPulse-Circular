"""
MQTT Digital Twin Telemetry & Control Bridge for PlantPulse Circular
Publishes real-time sensor & actuator states, and listens for control commands.
Works with any standard MQTT broker (Mosquitto, EMQX, HiveMQ) and provides an
in-memory buffer for real-time dashboard telemetry inspection.
"""

import json
import logging
import time
from collections import deque
from threading import Thread

logger = logging.getLogger("plantpulse.mqtt")

try:
    import paho.mqtt.client as mqtt
    PAHO_AVAILABLE = True
except ImportError:
    PAHO_AVAILABLE = False
    logger.warning("paho-mqtt not installed; running in local virtual bus mode.")

MAX_MESSAGE_BUFFER = 100

class MQTTDigitalTwinBridge:
    def __init__(self, broker_host="broker.emqx.io", broker_port=1883, client_id="plantpulse-twin-backend"):
        self.broker_host = broker_host
        self.broker_port = broker_port
        self.client_id = f"{client_id}-{int(time.time())}"
        self.client = None
        self.is_connected = False
        self.message_buffer = deque(maxlen=MAX_MESSAGE_BUFFER)
        self.command_callback = None

        if PAHO_AVAILABLE:
            try:
                # Support both paho-mqtt v1 and v2 API
                if hasattr(mqtt, "CallbackAPIVersion"):
                    self.client = mqtt.Client(
                        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                        client_id=self.client_id
                    )
                else:
                    self.client = mqtt.Client(client_id=self.client_id)

                self.client.on_connect = self._on_connect
                self.client.on_disconnect = self._on_disconnect
                self.client.on_message = self._on_message
            except Exception as e:
                logger.error(f"Failed to initialize MQTT client: {e}")
                self.client = None

    def start(self):
        """Asynchronously connect to broker without blocking app boot."""
        if not self.client:
            return
        
        def connect_worker():
            try:
                # 3-second timeout so offline environments start instantly
                self.client.connect_async(self.broker_host, self.broker_port, keepalive=60)
                self.client.loop_start()
            except Exception as e:
                logger.info(f"MQTT broker connection skipped: {e}. Virtual telemetry active.")

        t = Thread(target=connect_worker, daemon=True)
        t.start()

    def stop(self):
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception:
                pass

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.is_connected = True
            logger.info(f"Connected to MQTT broker {self.broker_host}:{self.broker_port}")
            # Subscribe to command topics
            self.client.subscribe("plantpulse/commands/#")
            self._log_event("system/connected", {"broker": self.broker_host, "status": "ONLINE"})
        else:
            self.is_connected = False
            logger.warning(f"MQTT connect failed with rc={rc}")

    def _on_disconnect(self, client, userdata, rc, properties=None):
        self.is_connected = False
        self._log_event("system/disconnected", {"reason_code": rc, "status": "OFFLINE"})

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            payload = msg.payload.decode("utf-8")
        
        self._log_event(msg.topic, payload, direction="INCOMING")
        if self.command_callback:
            self.command_callback(msg.topic, payload)

    def _log_event(self, topic, payload, direction="OUTGOING"):
        record = {
            "timestamp": time.strftime("%H:%M:%S"),
            "topic": topic,
            "direction": direction,
            "payload": payload
        }
        self.message_buffer.appendleft(record)

    def publish_topic(self, topic, data, qos=0, retain=False):
        """Publish to MQTT broker and log to in-memory message buffer."""
        payload_str = json.dumps(data) if isinstance(data, (dict, list)) else str(data)
        self._log_event(topic, data, direction="OUTGOING")

        if self.client and self.is_connected:
            try:
                self.client.publish(topic, payload_str, qos=qos, retain=retain)
            except Exception as e:
                logger.debug(f"Failed to publish to MQTT broker: {e}")

    def publish_snapshot(self, snapshot):
        """Broadcasts full digital twin state across individual IoT topics."""
        state = snapshot.get("state", {})
        weather = state.get("weather", {})
        beds = state.get("beds", [])
        sus = snapshot.get("sustainability", {})

        # Publish weather telemetry
        self.publish_topic("plantpulse/telemetry/weather", weather)

        # Publish individual bed sensor telemetry
        for bed in beds:
            self.publish_topic(f"plantpulse/telemetry/beds/{bed['id']}", bed)

        # Publish tank level & pump status
        self.publish_topic("plantpulse/telemetry/tank", {
            "tank_l": state.get("tank_l", 0),
            "tank_capacity_l": state.get("tank_capacity_l", 500),
            "tank_fill_pct": state.get("tank_fill_pct", 0),
            "last_action": state.get("last_action", {})
        })

        # Publish compost bioreactor status
        self.publish_topic("plantpulse/telemetry/compost", {
            "organic_waste_kg": state.get("organic_waste_kg", 0),
            "compost_ready_kg": state.get("compost_ready_kg", 0),
            "compost_pile_temp_c": state.get("compost_pile_temp_c", 0),
            "active_batches_count": len(state.get("composting_batches", []))
        })

        # Publish sustainability metrics
        self.publish_topic("plantpulse/telemetry/sustainability", {
            "freshwater_saved_l": sus.get("freshwater_saved_l_vs_fixed_baseline", 0),
            "savings_pct": sus.get("freshwater_savings_pct_vs_fixed_baseline", 0),
            "organic_recovery_pct": sus.get("organic_waste_recovery_pct", 0),
            "avoided_emissions_kg_co2e": sus.get("avoided_emissions_kg_co2e", 0),
            "average_plant_health_pct": sus.get("average_plant_health_pct", 0)
        })

        # Publish ML prediction telemetry
        self.publish_topic("plantpulse/telemetry/predictions", {
            "total_demand_l": snapshot.get("predicted_total_demand_l", 0),
            "by_bed": snapshot.get("predictions_l_by_bed", {})
        })

    def get_messages(self, limit=50):
        return list(self.message_buffer)[:limit]

    def get_status(self):
        return {
            "paho_available": PAHO_AVAILABLE,
            "connected": self.is_connected,
            "broker": f"{self.broker_host}:{self.broker_port}",
            "client_id": self.client_id,
            "buffered_messages": len(self.message_buffer)
        }

# Global singleton
mqtt_bridge = MQTTDigitalTwinBridge()
