"""SQLite database management and persistence for DRISHTI Digital Twin."""

from __future__ import annotations

import contextlib
import json
from pathlib import Path
import sqlite3
from typing import Any, Dict, Iterator, List, Optional

from backend.app.telemetry.schema import ExplainableAlert, FourValueDigitalTwinState

DEFAULT_DB_PATH = Path(__file__).resolve().parents[2] / "artifacts" / "drishti_twin.db"


class DrishtiDatabase:
    """Thread-safe SQLite persistence manager for fleet, missions, twin states, alerts, and reports."""

    def __init__(self, db_path: Optional[Path] = None) -> None:
        self.db_path = db_path or DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    @contextlib.contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS engines (
                    engine_id TEXT PRIMARY KEY,
                    tail_number TEXT NOT NULL,
                    uav_platform TEXT NOT NULL,
                    engine_model TEXT NOT NULL,
                    serial_number TEXT NOT NULL,
                    total_operating_hours REAL NOT NULL,
                    status TEXT NOT NULL,
                    active_mission_id TEXT NOT NULL,
                    latest_health_index REAL NOT NULL,
                    latest_fault_class TEXT NOT NULL,
                    latest_rul_status TEXT NOT NULL,
                    latest_rul_hours REAL,
                    data_source TEXT NOT NULL,
                    is_synthetic INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS missions (
                    mission_id TEXT PRIMARY KEY,
                    engine_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    mission_profile TEXT NOT NULL,
                    fault_class TEXT NOT NULL,
                    severity REAL NOT NULL,
                    onset_time_sec REAL NOT NULL,
                    duration_sec REAL NOT NULL,
                    random_seed INTEGER NOT NULL,
                    data_source TEXT NOT NULL,
                    is_synthetic INTEGER NOT NULL DEFAULT 1,
                    sample_count INTEGER NOT NULL DEFAULT 0,
                    alert_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    summary_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS twin_states (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    engine_id TEXT NOT NULL,
                    mission_id TEXT NOT NULL,
                    sequence_number INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    mission_elapsed_sec REAL NOT NULL,
                    health_index REAL NOT NULL,
                    predicted_fault_class TEXT NOT NULL,
                    is_anomaly INTEGER NOT NULL,
                    state_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_twin_engine_mission
                ON twin_states(engine_id, mission_id, sequence_number);

                CREATE TABLE IF NOT EXISTS alerts (
                    alert_id TEXT PRIMARY KEY,
                    engine_id TEXT NOT NULL,
                    mission_id TEXT NOT NULL,
                    sequence_number INTEGER NOT NULL,
                    timestamp TEXT NOT NULL,
                    fault_class TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    acknowledged INTEGER NOT NULL DEFAULT 0,
                    alert_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_alerts_engine
                ON alerts(engine_id, mission_id, sequence_number);

                CREATE TABLE IF NOT EXISTS simulations (
                    simulation_id TEXT PRIMARY KEY,
                    engine_id TEXT NOT NULL,
                    mission_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    config_json TEXT NOT NULL,
                    summary_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS reports (
                    report_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    engine_id TEXT NOT NULL,
                    mission_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    report_json TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS system_config (
                    config_key TEXT PRIMARY KEY,
                    config_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """
            )
            conn.commit()

    def clear_all(self) -> None:
        with self._connect() as conn:
            for tbl in ("engines", "missions", "twin_states", "alerts", "simulations", "reports"):
                conn.execute(f"DELETE FROM {tbl}")
            conn.commit()

    def upsert_engine(self, engine_meta: Dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO engines (
                    engine_id, tail_number, uav_platform, engine_model, serial_number,
                    total_operating_hours, status, active_mission_id, latest_health_index,
                    latest_fault_class, latest_rul_status, latest_rul_hours, data_source,
                    is_synthetic, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(engine_id) DO UPDATE SET
                    tail_number=excluded.tail_number,
                    uav_platform=excluded.uav_platform,
                    engine_model=excluded.engine_model,
                    serial_number=excluded.serial_number,
                    total_operating_hours=excluded.total_operating_hours,
                    status=excluded.status,
                    active_mission_id=excluded.active_mission_id,
                    latest_health_index=excluded.latest_health_index,
                    latest_fault_class=excluded.latest_fault_class,
                    latest_rul_status=excluded.latest_rul_status,
                    latest_rul_hours=excluded.latest_rul_hours,
                    data_source=excluded.data_source,
                    is_synthetic=excluded.is_synthetic,
                    updated_at=excluded.updated_at
                """,
                (
                    engine_meta["engine_id"],
                    engine_meta["tail_number"],
                    engine_meta["uav_platform"],
                    engine_meta["engine_model"],
                    engine_meta["serial_number"],
                    float(engine_meta["total_operating_hours"]),
                    engine_meta["status"],
                    engine_meta["active_mission_id"],
                    float(engine_meta["latest_health_index"]),
                    engine_meta["latest_fault_class"],
                    engine_meta["latest_rul_status"],
                    engine_meta.get("latest_rul_hours"),
                    engine_meta["data_source"],
                    1 if engine_meta.get("is_synthetic", True) else 0,
                    engine_meta["updated_at"],
                ),
            )
            conn.commit()

    def save_mission_and_states(
        self,
        mission_meta: Dict[str, Any],
        states: List[FourValueDigitalTwinState],
        alerts: List[ExplainableAlert],
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM twin_states WHERE engine_id = ? AND mission_id = ?",
                (mission_meta["engine_id"], mission_meta["mission_id"]),
            )
            conn.execute(
                "DELETE FROM alerts WHERE engine_id = ? AND mission_id = ?",
                (mission_meta["engine_id"], mission_meta["mission_id"]),
            )
            conn.execute(
                """
                INSERT INTO missions (
                    mission_id, engine_id, title, mission_profile, fault_class, severity,
                    onset_time_sec, duration_sec, random_seed, data_source, is_synthetic,
                    sample_count, alert_count, created_at, config_json, summary_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(mission_id) DO UPDATE SET
                    engine_id=excluded.engine_id,
                    title=excluded.title,
                    mission_profile=excluded.mission_profile,
                    fault_class=excluded.fault_class,
                    severity=excluded.severity,
                    onset_time_sec=excluded.onset_time_sec,
                    duration_sec=excluded.duration_sec,
                    random_seed=excluded.random_seed,
                    data_source=excluded.data_source,
                    is_synthetic=excluded.is_synthetic,
                    sample_count=excluded.sample_count,
                    alert_count=excluded.alert_count,
                    created_at=excluded.created_at,
                    config_json=excluded.config_json,
                    summary_json=excluded.summary_json
                """,
                (
                    mission_meta["mission_id"],
                    mission_meta["engine_id"],
                    mission_meta["title"],
                    mission_meta["mission_profile"],
                    mission_meta["fault_class"],
                    float(mission_meta["severity"]),
                    float(mission_meta["onset_time_sec"]),
                    float(mission_meta["duration_sec"]),
                    int(mission_meta["random_seed"]),
                    mission_meta["data_source"],
                    1 if mission_meta.get("is_synthetic", True) else 0,
                    len(states),
                    len(alerts),
                    mission_meta["created_at"],
                    json.dumps(mission_meta.get("config", {})),
                    json.dumps(mission_meta.get("summary", {})),
                ),
            )

            state_rows = [
                (
                    s.engine_id,
                    s.mission_id,
                    s.sequence_number,
                    s.timestamp,
                    s.mission_elapsed_sec,
                    s.predicted.health_index,
                    s.predicted.predicted_fault_class,
                    1 if s.predicted.is_anomaly else 0,
                    s.model_dump_json(),
                )
                for s in states
            ]
            conn.executemany(
                """
                INSERT INTO twin_states (
                    engine_id, mission_id, sequence_number, timestamp,
                    mission_elapsed_sec, health_index, predicted_fault_class,
                    is_anomaly, state_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                state_rows,
            )

            alert_rows = [
                (
                    a.alert_id,
                    a.engine_id,
                    a.mission_id,
                    a.sequence_number,
                    a.timestamp,
                    a.fault_class,
                    a.severity.value,
                    1 if a.acknowledged else 0,
                    a.model_dump_json(),
                )
                for a in alerts
            ]
            conn.executemany(
                """
                INSERT OR REPLACE INTO alerts (
                    alert_id, engine_id, mission_id, sequence_number,
                    timestamp, fault_class, severity, acknowledged, alert_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                alert_rows,
            )
            conn.commit()

    def save_simulation(self, sim_record: Dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO simulations (
                    simulation_id, engine_id, mission_id, created_at, config_json, summary_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    sim_record["simulation_id"],
                    sim_record["engine_id"],
                    sim_record["mission_id"],
                    sim_record["created_at"],
                    json.dumps(sim_record["config"]),
                    json.dumps(sim_record["summary"]),
                ),
            )
            conn.commit()

    def save_report(self, report_record: Dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO reports (
                    report_id, title, engine_id, mission_id, created_at, report_json
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    report_record["report_id"],
                    report_record["title"],
                    report_record["engine_id"],
                    report_record["mission_id"],
                    report_record["created_at"],
                    json.dumps(report_record),
                ),
            )
            conn.commit()

    def list_engines(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM engines ORDER BY engine_id ASC").fetchall()
            result = []
            for r in rows:
                d = dict(r)
                d["is_synthetic"] = bool(d["is_synthetic"])
                alert_cnt = conn.execute(
                    "SELECT COUNT(*) FROM alerts WHERE engine_id = ?", (d["engine_id"],)
                ).fetchone()[0]
                d["alert_count"] = int(alert_cnt)
                result.append(d)
            return result

    def get_engine(self, engine_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT * FROM engines WHERE engine_id = ?", (engine_id,)
            ).fetchone()
            if not r:
                return None
            d = dict(r)
            d["is_synthetic"] = bool(d["is_synthetic"])
            d["alert_count"] = int(
                conn.execute(
                    "SELECT COUNT(*) FROM alerts WHERE engine_id = ?", (engine_id,)
                ).fetchone()[0]
            )
            return d

    def get_engine_telemetry(
        self,
        engine_id: str,
        mission_id: Optional[str] = None,
        limit: int = 200,
        offset: int = 0,
    ) -> Dict[str, Any]:
        with self._connect() as conn:
            if not mission_id:
                eng = self.get_engine(engine_id)
                mission_id = eng["active_mission_id"] if eng else None
            if not mission_id:
                return {"total": 0, "items": [], "engine_id": engine_id, "mission_id": None}

            total = int(
                conn.execute(
                    "SELECT COUNT(*) FROM twin_states WHERE engine_id = ? AND mission_id = ?",
                    (engine_id, mission_id),
                ).fetchone()[0]
            )
            rows = conn.execute(
                """
                SELECT state_json FROM twin_states
                WHERE engine_id = ? AND mission_id = ?
                ORDER BY sequence_number ASC
                LIMIT ? OFFSET ?
                """,
                (engine_id, mission_id, limit, offset),
            ).fetchall()
            items = [json.loads(r["state_json"]) for r in rows]
            return {
                "engine_id": engine_id,
                "mission_id": mission_id,
                "total": total,
                "limit": limit,
                "offset": offset,
                "items": items,
            }

    def get_engine_alerts(
        self,
        engine_id: Optional[str] = None,
        mission_id: Optional[str] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            if engine_id and mission_id:
                rows = conn.execute(
                    "SELECT alert_json FROM alerts WHERE engine_id = ? AND mission_id = ? ORDER BY sequence_number DESC LIMIT ?",
                    (engine_id, mission_id, limit),
                ).fetchall()
            elif engine_id:
                rows = conn.execute(
                    "SELECT alert_json FROM alerts WHERE engine_id = ? ORDER BY sequence_number DESC LIMIT ?",
                    (engine_id, limit),
                ).fetchall()
            elif mission_id:
                rows = conn.execute(
                    "SELECT alert_json FROM alerts WHERE mission_id = ? ORDER BY sequence_number ASC LIMIT ?",
                    (mission_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT alert_json FROM alerts ORDER BY timestamp DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [json.loads(r["alert_json"]) for r in rows]

    def acknowledge_alert(self, alert_id: str, acknowledged: bool = True) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT alert_json FROM alerts WHERE alert_id = ?", (alert_id,)
            ).fetchone()
            if not row:
                return None
            alert_data = json.loads(row["alert_json"])
            alert_data["acknowledged"] = bool(acknowledged)
            conn.execute(
                "UPDATE alerts SET acknowledged = ?, alert_json = ? WHERE alert_id = ?",
                (1 if acknowledged else 0, json.dumps(alert_data), alert_id),
            )
            conn.commit()
            return alert_data

    def list_missions(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM missions ORDER BY created_at DESC, mission_id ASC").fetchall()
            items = []
            for r in rows:
                d = dict(r)
                d["is_synthetic"] = bool(d["is_synthetic"])
                d["config"] = json.loads(d.pop("config_json", "{}"))
                d["summary"] = json.loads(d.pop("summary_json", "{}"))
                items.append(d)
            return items

    def get_mission(self, mission_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT * FROM missions WHERE mission_id = ?", (mission_id,)
            ).fetchone()
            if not r:
                return None
            d = dict(r)
            d["is_synthetic"] = bool(d["is_synthetic"])
            d["config"] = json.loads(d.pop("config_json", "{}"))
            d["summary"] = json.loads(d.pop("summary_json", "{}"))
            return d

    def get_simulation(self, simulation_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT * FROM simulations WHERE simulation_id = ?", (simulation_id,)
            ).fetchone()
            if not r:
                return None
            d = dict(r)
            d["config"] = json.loads(d.pop("config_json", "{}"))
            d["summary"] = json.loads(d.pop("summary_json", "{}"))
            return d

    def list_reports(self) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM reports ORDER BY created_at DESC").fetchall()
            return [json.loads(r["report_json"]) for r in rows]

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT report_json FROM reports WHERE report_id = ?", (report_id,)
            ).fetchone()
            if not r:
                return None
            return json.loads(r["report_json"])

    def get_config(self, config_key: str) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            r = conn.execute(
                "SELECT config_json FROM system_config WHERE config_key = ?",
                (config_key,),
            ).fetchone()
            if not r:
                return None
            return json.loads(r["config_json"])

    def save_config(self, config_key: str, value: Dict[str, Any], updated_at: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO system_config (config_key, config_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (config_key, json.dumps(value), updated_at),
            )
            conn.commit()

