"""Mission replay state controller supporting play, pause, seek, speed, and synchronized slices."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class MissionReplayController:
    """Manages deterministic historical mission playback state and timestamp seeking."""

    def __init__(self) -> None:
        self.active_mission_id: Optional[str] = None
        self.active_engine_id: Optional[str] = None
        self.is_playing: bool = False
        self.playback_speed: float = 1.0
        self.current_index: int = 0
        self._states: List[Dict[str, Any]] = []
        self._alerts: List[Dict[str, Any]] = []
        self._mission_meta: Dict[str, Any] = {}

    def load_mission(
        self,
        mission_meta: Dict[str, Any],
        states: List[Dict[str, Any]],
        alerts: List[Dict[str, Any]],
        speed: float = 1.0,
        start_index: int = 0,
    ) -> Dict[str, Any]:
        self._mission_meta = mission_meta
        self._states = states
        self._alerts = alerts
        self.active_mission_id = mission_meta.get("mission_id")
        self.active_engine_id = mission_meta.get("engine_id")
        self.playback_speed = max(0.25, min(10.0, float(speed)))
        self.current_index = max(0, min(max(0, len(states) - 1), int(start_index)))
        self.is_playing = True
        return self.get_snapshot()

    def stop(self) -> Dict[str, Any]:
        self.is_playing = False
        return self.get_snapshot()

    def set_speed(self, speed: float) -> Dict[str, Any]:
        self.playback_speed = max(0.25, min(10.0, float(speed)))
        return self.get_snapshot()

    def seek(
        self,
        target_index: Optional[int] = None,
        target_timestamp: Optional[str] = None,
        target_elapsed_sec: Optional[float] = None,
    ) -> Dict[str, Any]:
        if not self._states:
            return self.get_snapshot()

        if target_index is not None:
            self.current_index = max(0, min(len(self._states) - 1, int(target_index)))
        elif target_elapsed_sec is not None:
            best_idx = min(
                range(len(self._states)),
                key=lambda i: abs(float(self._states[i]["mission_elapsed_sec"]) - float(target_elapsed_sec)),
            )
            self.current_index = best_idx
        elif target_timestamp is not None:
            # Exact or closest timestamp match
            best_idx = 0
            for idx, st in enumerate(self._states):
                if st["timestamp"] <= target_timestamp:
                    best_idx = idx
            self.current_index = best_idx

        return self.get_snapshot()

    def step_forward(self, steps: int = 1) -> Dict[str, Any]:
        if not self._states:
            return self.get_snapshot()
        self.current_index = min(len(self._states) - 1, self.current_index + max(1, steps))
        if self.current_index >= len(self._states) - 1:
            self.is_playing = False
        return self.get_snapshot()

    def get_snapshot(self) -> Dict[str, Any]:
        total = len(self._states)
        current_state = self._states[self.current_index] if total > 0 else None
        current_seq = current_state["sequence_number"] if current_state else 0
        current_ts = current_state["timestamp"] if current_state else None
        current_elapsed = current_state["mission_elapsed_sec"] if current_state else 0.0

        visible_alerts = [
            a for a in self._alerts if int(a["sequence_number"]) <= int(current_seq)
        ]

        return {
            "is_playing": self.is_playing,
            "playback_speed": self.playback_speed,
            "mission_id": self.active_mission_id,
            "engine_id": self.active_engine_id,
            "current_index": self.current_index,
            "total_frames": total,
            "current_timestamp": current_ts,
            "current_elapsed_sec": current_elapsed,
            "mission_metadata": self._mission_meta,
            "current_state": current_state,
            "synchronized_history": self._states[: self.current_index + 1] if total > 0 else [],
            "synchronized_alerts": visible_alerts,
            "all_mission_alerts": self._alerts,
        }
