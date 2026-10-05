"""FastAPI REST + WebSocket application for DRISHTI Digital Twin (SIH26054)."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.app.service import DrishtiTwinService
from backend.app.simulation.fault_simulator import FaultScenarioConfig
from backend.app.telemetry.schema import TELEMETRY_SCHEMA_VERSION, TelemetryInputFrame


class ReplayStartRequest(BaseModel):
    mission_id: str = Field(..., min_length=1)
    playback_speed: float = Field(default=1.0, ge=0.25, le=10.0)
    start_index: int = Field(default=0, ge=0)


class ReplaySeekRequest(BaseModel):
    target_index: Optional[int] = None
    target_timestamp: Optional[str] = None
    target_elapsed_sec: Optional[float] = None
    playback_speed: Optional[float] = None


class ReplayStepRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=50)


class CSVIngestRequest(BaseModel):
    csv_text: str = Field(..., min_length=10)
    engine_id: str = "ENG-MALE-01"
    mission_id: str = "MSN-CSV-001"
    title: str = "Historical CSV Telemetry Import"


def create_app(service: Optional[DrishtiTwinService] = None) -> FastAPI:
    twin_service = service or DrishtiTwinService(auto_seed=True)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = None
        if "pytest" not in sys.modules:
            task = asyncio.create_task(twin_service.run_continuous_simulation(interval_sec=1.0))
        try:
            yield
        finally:
            twin_service.stop_continuous_simulation()
            if task is not None:
                task.cancel()

    app = FastAPI(
        title="DRISHTI — AI-Enabled Aero Piston Engine Digital Twin API",
        description=(
            "Problem Statement SIH26054 (Robotics & Drones): Real-Time Physics-Informed "
            "Four-Value Digital Twin, 9-Class Fault Diagnostics, Sensor-Fault Isolation, "
            "Remaining Useful Life Estimation, and Explainable Maintenance Advisory."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.twin_service = twin_service

    @app.get("/health", tags=["System"])
    def get_health() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return {
            "status": "ok",
            "service": "DRISHTI Digital Twin Backend",
            "problem_statement": "SIH26054",
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "telemetry_schema_version": TELEMETRY_SCHEMA_VERSION,
            "physics_model_version": svc.physics_model.model_version,
            "ml_model_version": svc.ml_pipeline.model_version,
            "ml_models_loaded": svc.ml_pipeline.is_loaded,
            "model_bundle_sha256": svc.ml_pipeline.bundle_sha256,
            "last_inference_latency_ms": svc.last_inference_latency_ms,
            "throughput_frames_per_sec": svc.throughput_frames_per_sec,
            "can_interface": svc.can_adapter.get_interface_status(),
        }

    @app.get("/ready", tags=["System"])
    def get_readiness() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        engines = svc.db.list_engines()
        db_ready = len(engines) >= 0
        ml_ready = bool(svc.ml_pipeline.is_loaded)
        physics_ready = svc.physics_model is not None
        ready = db_ready and ml_ready and physics_ready
        if not ready:
            raise HTTPException(status_code=503, detail="DRISHTI Digital Twin subsystems not ready.")
        return {
            "status": "ready",
            "problem_statement": "SIH26054",
            "database_ready": db_ready,
            "seeded_engine_count": len(engines),
            "ml_bundle_ready": ml_ready,
            "physics_model_ready": physics_ready,
            "simulation_mode": True,
            "disclosure": "Operating in deterministic simulation & recorded telemetry mode (no live UAV flight hardware attached).",
        }

    @app.get("/api/config/health-policy", tags=["System"])
    def get_health_policy_endpoint() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.get_health_policy()

    @app.put("/api/config/health-policy", tags=["System"])
    def update_health_policy_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        try:
            updated = svc.update_health_policy(payload)
            return {"status": "updated", "health_policy": updated}
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/model-status", tags=["ML & Physics Models"])
    def get_model_status() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return {
            "ml_loaded": svc.ml_pipeline.is_loaded,
            "ml_model_version": svc.ml_pipeline.model_version,
            "bundle_sha256": svc.ml_pipeline.bundle_sha256,
            "physics_metadata": svc.physics_model.get_model_metadata(),
            "evaluation_report": svc.ml_pipeline.evaluation_report,
            "data_quality_stats": svc.validator.get_rejection_stats(),
        }

    @app.post("/api/model-retrain", tags=["ML & Physics Models"])
    def retrain_models(base_seed: int = Query(default=1000, ge=1)) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        report = svc.ml_pipeline.train_and_evaluate(base_seed=base_seed)
        return {"status": "retrained", "evaluation_report": report}

    @app.get("/api/catalog", tags=["System"])
    def get_catalog() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.get_system_catalog()

    @app.get("/api/fleet", tags=["Fleet & Engines"])
    def get_fleet() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.get_fleet_overview()

    @app.post("/api/fleet/seed", tags=["Fleet & Engines"])
    def seed_fleet() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        res = svc.seed_demo_fleet()
        return {"status": "seeded", **res, "fleet": svc.get_fleet_overview()}

    @app.get("/api/engines", tags=["Fleet & Engines"])
    def list_engines() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        engines = svc.db.list_engines()
        return {"total": len(engines), "items": engines}

    @app.get("/api/engines/{engine_id}", tags=["Fleet & Engines"])
    def get_engine_detail(engine_id: str) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        eng = svc.db.get_engine(engine_id)
        if not eng:
            raise HTTPException(status_code=404, detail=f"Engine '{engine_id}' not found.")
        telem = svc.db.get_engine_telemetry(engine_id, eng["active_mission_id"], limit=300)
        alerts = svc.db.get_engine_alerts(engine_id=engine_id, limit=100)
        latest_state = telem["items"][-1] if telem["items"] else None
        return {
            "engine": eng,
            "latest_state": latest_state,
            "telemetry_count": telem["total"],
            "alerts": alerts,
            "physics_metadata": svc.physics_model.get_model_metadata(),
        }

    @app.get("/api/engines/{engine_id}/parameter-groups", tags=["Fleet & Engines"])
    def get_engine_parameter_groups(engine_id: str) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        try:
            return svc.evaluate_engine_parameter_groups(engine_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/engines/{engine_id}/telemetry", tags=["Fleet & Engines"])
    def get_engine_telemetry(
        engine_id: str,
        mission_id: Optional[str] = Query(default=None),
        limit: int = Query(default=150, ge=1, le=1000),
        offset: int = Query(default=0, ge=0),
    ) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        eng = svc.db.get_engine(engine_id)
        if not eng:
            raise HTTPException(status_code=404, detail=f"Engine '{engine_id}' not found.")
        return svc.db.get_engine_telemetry(
            engine_id=engine_id, mission_id=mission_id, limit=limit, offset=offset
        )

    @app.get("/api/engines/{engine_id}/health", tags=["Fleet & Engines"])
    def get_engine_health(engine_id: str) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        eng = svc.db.get_engine(engine_id)
        if not eng:
            raise HTTPException(status_code=404, detail=f"Engine '{engine_id}' not found.")
        telem = svc.db.get_engine_telemetry(engine_id, eng["active_mission_id"], limit=200)
        items = telem["items"]
        latest = items[-1] if items else None
        trajectory = [
            {
                "sequence_number": st["sequence_number"],
                "mission_elapsed_sec": st["mission_elapsed_sec"],
                "timestamp": st["timestamp"],
                "health_index": st["predicted"]["health_index"],
                "rul_status": st["predicted"]["rul_status"],
                "rul_hours": st["predicted"]["rul_hours"],
                "rul_lower_10_hours": st["predicted"]["rul_lower_10_hours"],
                "rul_upper_90_hours": st["predicted"]["rul_upper_90_hours"],
                "rul_cycles": st["predicted"].get("rul_cycles"),
                "rul_lower_10_cycles": st["predicted"].get("rul_lower_10_cycles"),
                "rul_upper_90_cycles": st["predicted"].get("rul_upper_90_cycles"),
                "predicted_fault_class": st["predicted"]["predicted_fault_class"],
                "anomaly_score": st["predicted"]["anomaly_score"],
                "thermal_margin_pct": st["calculated"]["thermal_margin_pct"],
                "oil_pressure_margin_pct": st["calculated"]["oil_pressure_margin_pct"],
                "vibration_margin_pct": st["calculated"]["vibration_margin_pct"],
            }
            for st in items
        ]
        param_groups = svc.evaluate_engine_parameter_groups(engine_id).get("groups", [])
        return {
            "engine": eng,
            "latest_predicted": latest["predicted"] if latest else None,
            "latest_calculated": latest["calculated"] if latest else None,
            "health_weights": {"weights": svc.health_policy["weights"]},
            "health_policy": svc.health_policy,
            "parameter_groups": param_groups,
            "degradation_trajectory": trajectory,
        }

    @app.get("/api/engines/{engine_id}/alerts", tags=["Alerts"])
    def get_engine_alerts(
        engine_id: str,
        mission_id: Optional[str] = Query(default=None),
        limit: int = Query(default=100, ge=1, le=500),
    ) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        eng = svc.db.get_engine(engine_id)
        if not eng:
            raise HTTPException(status_code=404, detail=f"Engine '{engine_id}' not found.")
        items = svc.db.get_engine_alerts(
            engine_id=engine_id, mission_id=mission_id, limit=limit
        )
        return {"engine_id": engine_id, "total": len(items), "items": items}

    @app.post("/api/alerts/{alert_id}/acknowledge", tags=["Alerts"])
    def acknowledge_alert_endpoint(
        alert_id: str,
        acknowledged: bool = Query(default=True),
    ) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        updated = svc.db.acknowledge_alert(alert_id=alert_id, acknowledged=acknowledged)
        if not updated:
            raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")
        return {"status": "updated", "alert": updated}

    @app.post("/api/predict", tags=["ML & Physics Models"])
    def predict_single_telemetry(frame: TelemetryInputFrame) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        twin_state, alert = svc.process_telemetry_frame(frame)
        return {
            "twin_state": twin_state.model_dump(),
            "alert": alert.model_dump() if alert else None,
            "latency_ms": svc.last_inference_latency_ms,
        }

    @app.post("/api/simulations", tags=["Simulation & Replay"])
    def create_simulation(cfg: FaultScenarioConfig) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        try:
            result = svc.run_simulation_scenario(cfg)
            return result
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/simulations/{simulation_id}", tags=["Simulation & Replay"])
    def get_simulation(simulation_id: str) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        sim = svc.db.get_simulation(simulation_id)
        if not sim:
            raise HTTPException(
                status_code=404, detail=f"Simulation '{simulation_id}' not found."
            )
        telem = svc.db.get_engine_telemetry(sim["engine_id"], sim["mission_id"], limit=500)
        alerts = svc.db.get_engine_alerts(sim["engine_id"], sim["mission_id"], limit=500)
        return {
            "simulation": sim,
            "telemetry": telem["items"],
            "alerts": alerts,
        }

    @app.post("/api/telemetry/ingest-csv", tags=["Simulation & Replay"])
    def ingest_csv_endpoint(req: CSVIngestRequest) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        try:
            return svc.ingest_csv_mission(
                csv_text=req.csv_text,
                engine_id=req.engine_id,
                mission_id=req.mission_id,
                title=req.title,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/replay/start", tags=["Simulation & Replay"])
    def start_replay(req: ReplayStartRequest) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        mission = svc.db.get_mission(req.mission_id)
        if not mission:
            raise HTTPException(
                status_code=404, detail=f"Mission '{req.mission_id}' not found."
            )
        telem = svc.db.get_engine_telemetry(
            mission["engine_id"], req.mission_id, limit=1000
        )
        alerts = svc.db.get_engine_alerts(
            mission["engine_id"], req.mission_id, limit=1000
        )
        ordered_alerts = sorted(alerts, key=lambda a: int(a["sequence_number"]))
        return svc.replay_controller.load_mission(
            mission_meta=mission,
            states=telem["items"],
            alerts=ordered_alerts,
            speed=req.playback_speed,
            start_index=req.start_index,
        )

    @app.post("/api/replay/stop", tags=["Simulation & Replay"])
    def stop_replay() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.replay_controller.stop()

    @app.post("/api/replay/seek", tags=["Simulation & Replay"])
    def seek_replay(req: ReplaySeekRequest) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        if req.playback_speed is not None:
            svc.replay_controller.set_speed(req.playback_speed)
        return svc.replay_controller.seek(
            target_index=req.target_index,
            target_timestamp=req.target_timestamp,
            target_elapsed_sec=req.target_elapsed_sec,
        )

    @app.post("/api/replay/step", tags=["Simulation & Replay"])
    def step_replay(req: ReplayStepRequest) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.replay_controller.step_forward(steps=req.steps)

    @app.get("/api/replay/status", tags=["Simulation & Replay"])
    def get_replay_status() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        return svc.replay_controller.get_snapshot()

    @app.get("/api/missions", tags=["Simulation & Replay"])
    def list_missions() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        items = svc.db.list_missions()
        return {"total": len(items), "items": items}

    @app.get("/api/reports", tags=["Reports"])
    def list_reports() -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        items = svc.db.list_reports()
        return {"total": len(items), "items": items}

    @app.get("/api/reports/{report_id}", tags=["Reports"])
    def get_report(report_id: str) -> Dict[str, Any]:
        svc: DrishtiTwinService = app.state.twin_service
        rep = svc.db.get_report(report_id)
        if not rep:
            raise HTTPException(status_code=404, detail=f"Report '{report_id}' not found.")
        return rep

    @app.websocket("/ws/telemetry")
    async def websocket_telemetry(
        websocket: WebSocket,
        engine_id: str = Query(default="ENG-MALE-02"),
    ) -> None:
        await websocket.accept()
        svc: DrishtiTwinService = app.state.twin_service
        current_eng_id = engine_id
        queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=100)

        def listener(twin_state: Any, alert: Any) -> None:
            if twin_state.engine_id == current_eng_id:
                payload = {
                    "type": "telemetry_frame",
                    "engine_id": current_eng_id,
                    "mission_id": twin_state.mission_id,
                    "sequence_number": twin_state.sequence_number,
                    "twin_state": twin_state.model_dump(),
                    "alert": alert.model_dump() if alert else None,
                }
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    pass

        svc.subscribe_telemetry(listener)

        try:
            # 1. Send immediate latest state so UI displays immediately without waiting for next tick
            eng = svc.db.get_engine(current_eng_id)
            if eng:
                telem = svc.db.get_engine_telemetry(
                    current_eng_id, eng["active_mission_id"], limit=1
                )
                alerts = svc.db.get_engine_alerts(
                    current_eng_id, eng["active_mission_id"], limit=1
                )
                if telem["items"]:
                    await websocket.send_json(
                        {
                            "type": "telemetry_frame",
                            "engine_id": current_eng_id,
                            "mission_id": eng["active_mission_id"],
                            "sequence_number": telem["items"][-1]["sequence_number"],
                            "twin_state": telem["items"][-1],
                            "alert": alerts[0] if alerts else None,
                        }
                    )

            # 2. Concurrently read incoming client control messages and pump telemetry frames
            async def receive_loop() -> None:
                nonlocal current_eng_id
                while True:
                    text = await websocket.receive_text()
                    try:
                        msg = json.loads(text)
                        if msg.get("type") == "select_engine" and msg.get("engine_id"):
                            current_eng_id = str(msg["engine_id"])
                            eng_new = svc.db.get_engine(current_eng_id)
                            if eng_new:
                                t_new = svc.db.get_engine_telemetry(
                                    current_eng_id, eng_new["active_mission_id"], limit=1
                                )
                                a_new = svc.db.get_engine_alerts(
                                    current_eng_id, eng_new["active_mission_id"], limit=1
                                )
                                if t_new["items"]:
                                    await websocket.send_json(
                                        {
                                            "type": "telemetry_frame",
                                            "engine_id": current_eng_id,
                                            "mission_id": eng_new["active_mission_id"],
                                            "sequence_number": t_new["items"][-1]["sequence_number"],
                                            "twin_state": t_new["items"][-1],
                                            "alert": a_new[0] if a_new else None,
                                        }
                                    )
                    except Exception:
                        pass

            async def send_loop() -> None:
                while True:
                    payload = await queue.get()
                    await websocket.send_json(payload)

            recv_task = asyncio.create_task(receive_loop())
            send_task = asyncio.create_task(send_loop())
            done, pending = await asyncio.wait(
                [recv_task, send_task], return_when=asyncio.FIRST_COMPLETED
            )
            for t in pending:
                t.cancel()

        except WebSocketDisconnect:
            pass
        finally:
            svc.unsubscribe_telemetry(listener)

    dist_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist_dir.exists():
        from fastapi.staticfiles import StaticFiles

        app.mount("/", StaticFiles(directory=str(dist_dir), html=True), name="frontend_static")

    return app


app = create_app()
