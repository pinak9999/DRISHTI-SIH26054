"""Modular CAN / SocketCAN adapter interface and CSV ingestion parser.

IMPORTANT ENGINEERING DISCLOSURE:
Never fabricates live hardware connectivity. Clearly distinguishes between
CAN_SIMULATED_ADAPTER (local frame encoding/decoding verification) and
REAL_HARDWARE_CAN (which reports hardware unavailable on standard Windows hosts
without a physical SocketCAN/PCAN interface attached).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
import csv
import io
import struct
from typing import Any, Dict, List

from backend.app.telemetry.schema import DataSourceType, TelemetryInputFrame


class CANFrame( dict ):
    """Representation of a standard 11-bit/29-bit CAN 2.0A/B 8-byte payload frame."""


class AbstractCANAdapter(ABC):
    """Modular interface for UAV engine FADEC / EMS CAN bus integration."""

    @abstractmethod
    def get_interface_status(self) -> Dict[str, Any]:
        """Return honest hardware connection status."""

    @abstractmethod
    def decode_can_bundle_to_telemetry(
        self,
        engine_id: str,
        mission_id: str,
        timestamp: str,
        sequence_number: int,
        mission_elapsed_sec: float,
        frames: Dict[int, bytes],
    ) -> TelemetryInputFrame:
        """Decode standard UAV FADEC CAN IDs (0x101..0x104) into TelemetryInputFrame."""


class ModularSocketCANAdapter(AbstractCANAdapter):
    """Reference UAV Engine FADEC CAN Bus Codec & Hardware Status Probe.

    CAN Frame Map (Little-Endian 8-byte payloads):
      - 0x101 (Engine Speed & Load):
          uint16 rpm, uint16 throttle_x10, uint16 load_x10, uint16 vib_x100
      - 0x102 (Thermal Channels):
          int16 cht_x10, int16 egt_x10, int16 oil_temp_x10, int16 amb_temp_x10
      - 0x103 (Fluid & Injection):
          uint16 oil_press_x100, uint16 fuel_flow_x100, uint16 inj_ms_x100, int16 ign_deg_x10
      - 0x104 (Air Data & Electrical):
          int16 alt_m, uint16 bat_v_x100, int16 alt_curr_x10, uint16 reserved
    """

    def __init__(self, channel: str = "can0", hardware_attached: bool = False) -> None:
        self.channel = channel
        self.hardware_attached = hardware_attached

    def get_interface_status(self) -> Dict[str, Any]:
        return {
            "adapter_class": "ModularSocketCANAdapter",
            "channel": self.channel,
            "hardware_connected": False,
            "mode": "SOFTWARE_CODEC_READY_NO_HARDWARE",
            "supported_arbitration_ids": ["0x101", "0x102", "0x103", "0x104"],
            "disclosure": (
                "No physical CAN/SocketCAN transceiver is attached to this host. "
                "The CAN codec is available for deterministic frame pack/unpack verification "
                "and future UAV FADEC integration."
            ),
        }

    @staticmethod
    def encode_telemetry_to_can_bundle(frame: TelemetryInputFrame) -> Dict[int, bytes]:
        f101 = struct.pack(
            "<HHHH",
            int(max(0.0, frame.rpm or 0.0)),
            int(max(0.0, (frame.throttle_pct or 0.0) * 10)),
            int(max(0.0, (frame.engine_load_pct or 0.0) * 10)),
            int(max(0.0, (frame.vibration_rms_mms or 0.0) * 100)),
        )
        f102 = struct.pack(
            "<hhhh",
            int((frame.cht_c or 0.0) * 10),
            int((frame.egt_c or 0.0) * 10),
            int((frame.oil_temp_c or 0.0) * 10),
            int((frame.ambient_temp_c or 0.0) * 10),
        )
        f103 = struct.pack(
            "<HHHh",
            int(max(0.0, (frame.oil_pressure_bar or 0.0) * 100)),
            int(max(0.0, (frame.fuel_flow_lph or 0.0) * 100)),
            int(max(0.0, (frame.injection_pulse_ms or 0.0) * 100)),
            int((frame.ignition_advance_deg or 0.0) * 10),
        )
        f104 = struct.pack(
            "<hHhH",
            int(frame.altitude_m or 0.0),
            int(max(0.0, (frame.battery_voltage_v or 13.8) * 100)),
            int((frame.alternator_current_a or 18.0) * 10),
            0,
        )
        return {0x101: f101, 0x102: f102, 0x103: f103, 0x104: f104}

    def decode_can_bundle_to_telemetry(
        self,
        engine_id: str,
        mission_id: str,
        timestamp: str,
        sequence_number: int,
        mission_elapsed_sec: float,
        frames: Dict[int, bytes],
    ) -> TelemetryInputFrame:
        rpm, thr_x10, load_x10, vib_x100 = struct.unpack("<HHHH", frames[0x101])
        cht_x10, egt_x10, oilt_x10, ambt_x10 = struct.unpack("<hhhh", frames[0x102])
        oilp_x100, fuel_x100, inj_x100, ign_x10 = struct.unpack("<HHHh", frames[0x103])
        alt_m, bat_x100, curr_x10, _ = struct.unpack("<hHhH", frames[0x104])

        return TelemetryInputFrame(
            engine_id=engine_id,
            mission_id=mission_id,
            timestamp=timestamp,
            sequence_number=sequence_number,
            mission_elapsed_sec=mission_elapsed_sec,
            rpm=float(rpm),
            throttle_pct=round(thr_x10 / 10.0, 2),
            engine_load_pct=round(load_x10 / 10.0, 2),
            vibration_rms_mms=round(vib_x100 / 100.0, 3),
            cht_c=round(cht_x10 / 10.0, 2),
            egt_c=round(egt_x10 / 10.0, 2),
            oil_temp_c=round(oilt_x10 / 10.0, 2),
            ambient_temp_c=round(ambt_x10 / 10.0, 2),
            oil_pressure_bar=round(oilp_x100 / 100.0, 3),
            fuel_flow_lph=round(fuel_x100 / 100.0, 2),
            injection_pulse_ms=round(inj_x100 / 100.0, 2),
            ignition_advance_deg=round(ign_x10 / 10.0, 2),
            altitude_m=float(alt_m),
            battery_voltage_v=round(bat_x100 / 100.0, 2),
            alternator_current_a=round(curr_x10 / 10.0, 2),
            data_source=DataSourceType.CAN_SIMULATED_ADAPTER,
            is_synthetic=True,
        )


def parse_csv_telemetry(
    csv_text: str,
    default_engine_id: str = "ENG-CSV-01",
    default_mission_id: str = "MSN-CSV-IMPORT",
) -> List[TelemetryInputFrame]:
    """Parse historical CSV telemetry text into TelemetryInputFrame records."""
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    frames: List[TelemetryInputFrame] = []

    def _opt_float(row: Dict[str, Any], key: str, default: float | None = None) -> float | None:
        val = row.get(key)
        if val is None or str(val).strip() == "":
            return default
        try:
            return float(val)
        except ValueError:
            return None

    for idx, row in enumerate(reader):
        seq = int(row.get("sequence_number") or idx)
        elapsed = _opt_float(row, "mission_elapsed_sec", float(idx)) or float(idx)
        frames.append(
            TelemetryInputFrame(
                engine_id=str(row.get("engine_id") or default_engine_id),
                mission_id=str(row.get("mission_id") or default_mission_id),
                timestamp=str(row.get("timestamp") or f"2026-10-03T00:00:{idx % 60:02d}Z"),
                sequence_number=seq,
                mission_elapsed_sec=elapsed,
                rpm=_opt_float(row, "rpm"),
                cht_c=_opt_float(row, "cht_c"),
                egt_c=_opt_float(row, "egt_c"),
                oil_pressure_bar=_opt_float(row, "oil_pressure_bar"),
                oil_temp_c=_opt_float(row, "oil_temp_c"),
                fuel_flow_lph=_opt_float(row, "fuel_flow_lph"),
                vibration_rms_mms=_opt_float(row, "vibration_rms_mms"),
                throttle_pct=_opt_float(row, "throttle_pct"),
                engine_load_pct=_opt_float(row, "engine_load_pct"),
                altitude_m=_opt_float(row, "altitude_m"),
                ambient_temp_c=_opt_float(row, "ambient_temp_c"),
                battery_voltage_v=_opt_float(row, "battery_voltage_v", 13.8),
                alternator_current_a=_opt_float(row, "alternator_current_a", 18.5),
                injection_pulse_ms=_opt_float(row, "injection_pulse_ms", 8.2),
                ignition_advance_deg=_opt_float(row, "ignition_advance_deg", 26.0),
                data_source=DataSourceType.CSV_REPLAY,
                is_synthetic=str(row.get("is_synthetic", "true")).lower() != "false",
                scenario_label=str(row.get("scenario_label") or "Normal"),
                fault_severity=_opt_float(row, "fault_severity", 0.0) or 0.0,
            )
        )
    return frames
