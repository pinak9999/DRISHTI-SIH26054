import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  Box,
  Camera,
  Cpu,
  Eye,
  Layers,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { FourValueDigitalTwinState } from '../types/telemetry';

export type EngineSubsystemId =
  | 'crankcase_assembly'
  | 'crankshaft_train'
  | 'cylinder_bank_port'
  | 'cylinder_bank_stbd'
  | 'cylinder_heads_valves'
  | 'cooling_plenum'
  | 'lubrication_system'
  | 'fuel_injection_rail'
  | 'exhaust_turbo_unit'
  | 'sensor_fadec_harness';

export interface SubsystemMeta {
  id: EngineSubsystemId;
  code: string;
  name: string;
  subsystemGroup: string;
  description: string;
  localizationDisclosure: string;
  relatedFaultClasses: string[];
}

export const ENGINE_SUBSYSTEMS: SubsystemMeta[] = [
  {
    id: 'crankcase_assembly',
    code: 'SUB-01',
    name: 'Central Split Crankcase & Main Journals',
    subsystemGroup: 'Core Mechanical',
    description:
      'Cast aluminum-alloy horizontally-split crankcase housing main journal bearings and crankcase breather path.',
    localizationDisclosure:
      'Evaluated via aggregate broadband vibration RMS, oil pressure, and oil temperature residuals.',
    relatedFaultClasses: ['Crankshaft Bearing Wear', 'Piston Ring Wear'],
  },
  {
    id: 'crankshaft_train',
    code: 'SUB-02',
    name: 'Crankshaft, Connecting Rods & Prop Reduction Hub',
    subsystemGroup: 'Core Mechanical',
    description:
      'Forged 4-throw crankshaft, connecting rod journals, and integrated torsional reduction gearbox output flange.',
    localizationDisclosure:
      'Angular velocity scaled from measured engine RPM; bearing state inferred from broadband vibration & oil pressure.',
    relatedFaultClasses: ['Crankshaft Bearing Wear', 'Cylinder Misfire'],
  },
  {
    id: 'cylinder_bank_port',
    code: 'SUB-03',
    name: 'Port Horizontally-Opposed Cylinders (#1 & #3)',
    subsystemGroup: 'Power Cylinders',
    description:
      'Left-hand finned cylinder barrels and reciprocating piston ring packs.',
    localizationDisclosure:
      'Telemetry schema provides aggregate engine CHT/EGT; individual cylinder #1/#3 thermocouples are not separately instrumented.',
    relatedFaultClasses: [
      'Cylinder Overheating',
      'Piston Ring Wear',
      'Cylinder Misfire',
    ],
  },
  {
    id: 'cylinder_bank_stbd',
    code: 'SUB-04',
    name: 'Starboard Horizontally-Opposed Cylinders (#2 & #4)',
    subsystemGroup: 'Power Cylinders',
    description:
      'Right-hand finned cylinder barrels and reciprocating piston ring packs.',
    localizationDisclosure:
      'Telemetry schema provides aggregate engine CHT/EGT; individual cylinder #2/#4 thermocouples are not separately instrumented.',
    relatedFaultClasses: [
      'Cylinder Overheating',
      'Piston Ring Wear',
      'Cylinder Misfire',
    ],
  },
  {
    id: 'cylinder_heads_valves',
    code: 'SUB-05',
    name: 'Cylinder Heads, Valvetrain & Dual Ignition',
    subsystemGroup: 'Thermal & Valvetrain',
    description:
      'Aluminum cylinder heads with intake/exhaust poppet valves, hydraulic lifters, and dual-spark ignition plugs.',
    localizationDisclosure:
      'Monitored via aggregate CHT, EGT, ignition advance, and valvetrain vibration residuals.',
    relatedFaultClasses: [
      'Cylinder Overheating',
      'Valve Clearance Issue',
      'Cylinder Misfire',
    ],
  },
  {
    id: 'cooling_plenum',
    code: 'SUB-06',
    name: 'Inter-Cylinder Air Cooling Baffles & Shroud',
    subsystemGroup: 'Thermal Management',
    description:
      'Ram-air cooling plenum and directional cylinder-head baffle plates governing convective heat rejection.',
    localizationDisclosure:
      'Evaluated via physics-model ISA cooling effectiveness η and CHT actual-vs-expected residual.',
    relatedFaultClasses: ['Cylinder Overheating'],
  },
  {
    id: 'lubrication_system',
    code: 'SUB-07',
    name: 'Dry-Sump Oil Pump, Regulator & Cooler Circuit',
    subsystemGroup: 'Lubrication System',
    description:
      'Gear-type oil pressure/scavenge pump, pressure-relief regulator valve, oil cooler matrix, and main oil gallery.',
    localizationDisclosure:
      'Directly monitored via Oil Pressure (bar) and Oil Temperature (degC) actual vs physics-expected values.',
    relatedFaultClasses: [
      'Oil Pressure Drop',
      'Crankshaft Bearing Wear',
      'Piston Ring Wear',
    ],
  },
  {
    id: 'fuel_injection_rail',
    code: 'SUB-08',
    name: 'Electronic Fuel Injection Rail & Throttle Body',
    subsystemGroup: 'Fuel & Air Induction',
    description:
      'Common fuel distribution rail, solenoid injectors, and throttle valve assembly.',
    localizationDisclosure:
      'Monitored via Fuel Flow (L/h), Injection Pulse Width (ms), and Throttle Position (%) residuals.',
    relatedFaultClasses: ['Fuel Injector Clogging'],
  },
  {
    id: 'exhaust_turbo_unit',
    code: 'SUB-09',
    name: '4-into-1 Exhaust Collector & Turbocharger Unit',
    subsystemGroup: 'Exhaust & Boost',
    description:
      'Inconel/stainless exhaust runners feeding altitude-compensating wastegated turbocharger turbine and compressor.',
    localizationDisclosure:
      'Monitored via EGT (degC), Pressure Altitude (m), and ISA Air Density Ratio σ.',
    relatedFaultClasses: [
      'Valve Clearance Issue',
      'Cylinder Misfire',
      'Fuel Injector Clogging',
    ],
  },
  {
    id: 'sensor_fadec_harness',
    code: 'SUB-10',
    name: 'FADEC Sensor Harness & Alternator Bus',
    subsystemGroup: 'Avionics & Instrumentation',
    description:
      'Thermocouple/transducer instrumentation harness, 14V alternator/regulator bus, and CAN telemetry interface.',
    localizationDisclosure:
      'Monitored by TelemetryValidator quality checks and dedicated cross-channel SensorFaultIsolator.',
    relatedFaultClasses: ['Sensor Fault'],
  },
];

export type ComponentHealthState = 'NOMINAL' | 'WARNING' | 'CRITICAL';

export function evaluateSubsystemStates(
  twinState: FourValueDigitalTwinState | null
): Record<EngineSubsystemId, { status: ComponentHealthState; reason: string }> {
  const base: Record<
    EngineSubsystemId,
    { status: ComponentHealthState; reason: string }
  > = {
    crankcase_assembly: { status: 'NOMINAL', reason: 'Within reference bounds' },
    crankshaft_train: { status: 'NOMINAL', reason: 'Within reference bounds' },
    cylinder_bank_port: { status: 'NOMINAL', reason: 'Within reference bounds' },
    cylinder_bank_stbd: { status: 'NOMINAL', reason: 'Within reference bounds' },
    cylinder_heads_valves: {
      status: 'NOMINAL',
      reason: 'Within reference bounds',
    },
    cooling_plenum: { status: 'NOMINAL', reason: 'Within reference bounds' },
    lubrication_system: { status: 'NOMINAL', reason: 'Within reference bounds' },
    fuel_injection_rail: {
      status: 'NOMINAL',
      reason: 'Within reference bounds',
    },
    exhaust_turbo_unit: { status: 'NOMINAL', reason: 'Within reference bounds' },
    sensor_fadec_harness: {
      status: 'NOMINAL',
      reason: 'All sensor channels valid',
    },
  };

  if (!twinState) return base;

  const { actual, calculated, predicted } = twinState;
  const fc = predicted.predicted_fault_class;
  const isCrit =
    predicted.health_index < 48 ||
    actual.cht_c >= 230 ||
    actual.oil_pressure_bar <= 1.65 ||
    actual.vibration_rms_mms >= 6.8;

  const severityLevel: ComponentHealthState = isCrit ? 'CRITICAL' : 'WARNING';

  // 1. Sensor Fault Isolation
  if (
    predicted.sensor_diagnosis.is_sensor_fault_detected ||
    fc === 'Sensor Fault' ||
    !actual.quality.is_valid
  ) {
    const chs =
      predicted.sensor_diagnosis.suspected_channels.join(', ') ||
      actual.quality.invalid_sensor_channels.join(', ') ||
      'instrument channel';
    base.sensor_fadec_harness = {
      status: 'WARNING',
      reason: `Isolated sensor anomaly on ${chs} (${
        predicted.sensor_diagnosis.fault_submode || 'quality flag'
      })`,
    };
  }

  // 2. Cylinder Overheating / Thermal Excursion
  if (fc === 'Cylinder Overheating' || calculated.cht_residual_c > 15.0) {
    const msg = `CHT residual ${
      calculated.cht_residual_c >= 0 ? '+' : ''
    }${calculated.cht_residual_c.toFixed(1)} °C (Actual ${actual.cht_c.toFixed(
      1
    )} °C)`;
    base.cylinder_heads_valves = { status: severityLevel, reason: msg };
    base.cylinder_bank_port = { status: severityLevel, reason: msg };
    base.cylinder_bank_stbd = { status: severityLevel, reason: msg };
    base.cooling_plenum = {
      status: severityLevel,
      reason: `Cooling baffle degradation / CHT excursion (${msg})`,
    };
  }

  // 3. Oil Pressure Drop
  if (
    fc === 'Oil Pressure Drop' ||
    calculated.oil_pressure_residual_bar < -0.65
  ) {
    const msg = `Oil pressure residual ${calculated.oil_pressure_residual_bar.toFixed(
      2
    )} bar (Actual ${actual.oil_pressure_bar.toFixed(2)} bar)`;
    base.lubrication_system = { status: severityLevel, reason: msg };
    base.crankcase_assembly = {
      status: 'WARNING',
      reason: `Main gallery lubrication pressure bleed (${msg})`,
    };
  }

  // 4. Crankshaft Bearing Wear
  if (
    fc === 'Crankshaft Bearing Wear' ||
    calculated.vibration_residual_mms > 2.2
  ) {
    const msg = `Vibration residual +${calculated.vibration_residual_mms.toFixed(
      2
    )} mm/s, Oil P residual ${calculated.oil_pressure_residual_bar.toFixed(
      2
    )} bar`;
    base.crankshaft_train = { status: severityLevel, reason: msg };
    base.crankcase_assembly = { status: severityLevel, reason: msg };
    base.lubrication_system = {
      status: 'WARNING',
      reason: `Journal clearance oil bleed & thermal rise`,
    };
  }

  // 5. Cylinder Misfire
  if (fc === 'Cylinder Misfire' || calculated.egt_residual_c < -40.0) {
    const msg = `Combustion misfire: EGT residual ${calculated.egt_residual_c.toFixed(
      1
    )} °C, Vib +${calculated.vibration_residual_mms.toFixed(2)} mm/s`;
    base.cylinder_heads_valves = { status: severityLevel, reason: msg };
    base.cylinder_bank_port = { status: 'WARNING', reason: msg };
    base.cylinder_bank_stbd = { status: 'WARNING', reason: msg };
    base.crankshaft_train = {
      status: 'WARNING',
      reason: 'Torsional firing imbalance',
    };
  }

  // 6. Piston Ring Wear
  if (fc === 'Piston Ring Wear') {
    const msg = `Crankcase blow-by: Oil T residual +${calculated.oil_temp_residual_c.toFixed(
      1
    )} °C, Fuel residual +${calculated.fuel_flow_residual_lph.toFixed(2)} L/h`;
    base.cylinder_bank_port = { status: severityLevel, reason: msg };
    base.cylinder_bank_stbd = { status: severityLevel, reason: msg };
    base.lubrication_system = { status: 'WARNING', reason: msg };
  }

  // 7. Valve Clearance Issue
  if (fc === 'Valve Clearance Issue') {
    const msg = `Valvetrain clearance anomaly: EGT residual +${calculated.egt_residual_c.toFixed(
      1
    )} °C, Vib +${calculated.vibration_residual_mms.toFixed(2)} mm/s`;
    base.cylinder_heads_valves = { status: severityLevel, reason: msg };
    base.exhaust_turbo_unit = { status: 'WARNING', reason: msg };
  }

  // 8. Fuel Injector Clogging
  if (
    fc === 'Fuel Injector Clogging' ||
    calculated.fuel_flow_residual_lph < -2.2
  ) {
    const msg = `Nozzle restriction: Fuel residual ${calculated.fuel_flow_residual_lph.toFixed(
      2
    )} L/h, Pulse +${calculated.injection_pulse_residual_ms.toFixed(2)} ms`;
    base.fuel_injection_rail = { status: severityLevel, reason: msg };
    base.exhaust_turbo_unit = {
      status: 'WARNING',
      reason: `Lean-burn EGT rise (+${calculated.egt_residual_c.toFixed(1)} °C)`,
    };
  }

  return base;
}

function getSubsystemColor(
  status: ComponentHealthState,
  isSelected: boolean,
  baseHex: string
): string {
  if (status === 'CRITICAL') return '#b91c1c';
  if (status === 'WARNING') return '#d97706';
  if (isSelected) return '#36d9ff';
  return baseHex;
}

function getSubsystemEmissive(
  status: ComponentHealthState,
  isSelected: boolean
): string {
  if (status === 'CRITICAL') return '#58111a';
  if (status === 'WARNING') return '#451a03';
  if (isSelected) return '#083344';
  return '#000000';
}

/* =========================================================================
   PROCEDURAL 3D AERO PISTON ENGINE MESH ASSEMBLY (THREE.JS / R3F)
   ========================================================================= */
const ProceduralAeroEngineScene: React.FC<{
  twinState: FourValueDigitalTwinState | null;
  subsystemStates: Record<
    EngineSubsystemId,
    { status: ComponentHealthState; reason: string }
  >;
  selectedSubsystem: EngineSubsystemId;
  onSelectSubsystem: (id: EngineSubsystemId) => void;
  explodeFactor: number;
  wireframe: boolean;
  showLabels: boolean;
  animateKinematics: boolean;
}> = ({
  twinState,
  subsystemStates,
  selectedSubsystem,
  onSelectSubsystem,
  explodeFactor,
  wireframe,
  showLabels,
  animateKinematics,
}) => {
  const crankRef = useRef<THREE.Group>(null);
  const propHubRef = useRef<THREE.Group>(null);
  const engineRootRef = useRef<THREE.Group>(null);

  const rpm = twinState?.actual.rpm ?? 4800;
  const vibRms = twinState?.actual.vibration_rms_mms ?? 2.2;
  const e = explodeFactor; // 0.0 to 1.0

  useFrame((_, delta) => {
    if (!animateKinematics) {
      if (engineRootRef.current) {
        engineRootRef.current.position.set(0, 0, 0);
      }
      return;
    }
    // Proportional angular speed driven by actual telemetry RPM (scaled for visual clarity at 60Hz)
    const omega = (rpm / 5000) * 8.5;
    if (crankRef.current) {
      crankRef.current.rotation.z += omega * delta;
    }
    if (propHubRef.current) {
      propHubRef.current.rotation.z += omega * 0.42 * delta;
    }
    // Subtle physical vibration displacement only when actual vibration RMS is elevated
    if (engineRootRef.current) {
      const vibAmp = Math.max(0, (vibRms - 2.6) * 0.0035);
      if (vibAmp > 0) {
        const t = performance.now() * 0.045;
        engineRootRef.current.position.x = Math.sin(t * 2.3) * vibAmp;
        engineRootRef.current.position.y = Math.cos(t * 3.1) * vibAmp;
      } else {
        engineRootRef.current.position.set(0, 0, 0);
      }
    }
  });

  const matProps = (id: EngineSubsystemId, baseHex: string, metalness = 0.65, roughness = 0.35) => {
    const st = subsystemStates[id]?.status || 'NOMINAL';
    const isSel = selectedSubsystem === id;
    return {
      color: getSubsystemColor(st, isSel, baseHex),
      emissive: getSubsystemEmissive(st, isSel),
      emissiveIntensity: st !== 'NOMINAL' ? 0.55 : isSel ? 0.45 : 0.0,
      metalness,
      roughness,
      wireframe,
    };
  };

  return (
    <group ref={engineRootRef}>
      {/* 1. CENTRAL SPLIT CRANKCASE & MAIN JOURNAL HOUSING */}
      <group
        position={[0, 0, 0]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('crankcase_assembly');
        }}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.35, 1.15, 2.55]} />
          <meshStandardMaterial {...matProps('crankcase_assembly', '#475569', 0.7, 0.35)} />
        </mesh>
        {/* Top crankcase spine bolt flange */}
        <mesh position={[0, 0.62, 0]}>
          <boxGeometry args={[0.28, 0.14, 2.45]} />
          <meshStandardMaterial {...matProps('crankcase_assembly', '#64748b', 0.75, 0.3)} />
        </mesh>
      </group>

      {/* 2. CRANKSHAFT, COUNTERWEIGHTS & PROP REDUCTION GEARBOX */}
      <group
        position={[0, 0, 0.85 * e]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('crankshaft_train');
        }}
      >
        {/* Reduction gearbox nose housing */}
        <mesh position={[0, 0.12, 1.48]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.42, 0.52, 0.55, 24]} />
          <meshStandardMaterial {...matProps('crankshaft_train', '#334155', 0.75, 0.3)} />
        </mesh>

        {/* Internal rotating crankshaft shaft & throws */}
        <group ref={crankRef}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 2.8, 20]} />
            <meshStandardMaterial {...matProps('crankshaft_train', '#94a3b8', 0.85, 0.2)} />
          </mesh>
          {[-0.75, -0.25, 0.25, 0.75].map((zPos, idx) => (
            <mesh
              key={idx}
              position={[idx % 2 === 0 ? 0.16 : -0.16, 0, zPos]}
            >
              <boxGeometry args={[0.48, 0.22, 0.12]} />
              <meshStandardMaterial {...matProps('crankshaft_train', '#cbd5e1', 0.85, 0.25)} />
            </mesh>
          ))}
        </group>

        {/* Propeller drive flange & spinner cone */}
        <group ref={propHubRef} position={[0, 0.12, 1.88]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.36, 0.36, 0.12, 24]} />
            <meshStandardMaterial {...matProps('crankshaft_train', '#64748b', 0.8, 0.25)} />
          </mesh>
          <mesh position={[0, 0, 0.15]}>
            <boxGeometry args={[1.55, 0.16, 0.05]} />
            <meshStandardMaterial {...matProps('crankshaft_train', '#1e293b', 0.5, 0.4)} />
          </mesh>
          <mesh position={[0, 0, 0.15]} rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[1.55, 0.16, 0.05]} />
            <meshStandardMaterial {...matProps('crankshaft_train', '#1e293b', 0.5, 0.4)} />
          </mesh>
        </group>
      </group>

      {/* 3. PORT HORIZONTALLY-OPPOSED CYLINDERS (#1 & #3) */}
      <group
        position={[-1.05 - 0.85 * e, 0.05, 0]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('cylinder_bank_port');
        }}
      >
        {[-0.62, 0.62].map((zOff, idx) => (
          <group key={idx} position={[0, 0, zOff]}>
            {/* Cylinder barrel */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.38, 0.36, 0.78, 24]} />
              <meshStandardMaterial {...matProps('cylinder_bank_port', '#475569', 0.7, 0.35)} />
            </mesh>
            {/* Cooling fins */}
            {[-0.24, -0.1, 0.04, 0.18].map((fOff, fIdx) => (
              <mesh key={fIdx} position={[fOff, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.47, 0.47, 0.03, 24]} />
                <meshStandardMaterial {...matProps('cylinder_bank_port', '#64748b', 0.75, 0.3)} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* 4. STARBOARD HORIZONTALLY-OPPOSED CYLINDERS (#2 & #4) */}
      <group
        position={[1.05 + 0.85 * e, 0.05, 0]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('cylinder_bank_stbd');
        }}
      >
        {[-0.62, 0.62].map((zOff, idx) => (
          <group key={idx} position={[0, 0, zOff]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.38, 0.36, 0.78, 24]} />
              <meshStandardMaterial {...matProps('cylinder_bank_stbd', '#475569', 0.7, 0.35)} />
            </mesh>
            {[-0.18, -0.04, 0.1, 0.24].map((fOff, fIdx) => (
              <mesh key={fIdx} position={[fOff, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.47, 0.47, 0.03, 24]} />
                <meshStandardMaterial {...matProps('cylinder_bank_stbd', '#64748b', 0.75, 0.3)} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* 5. CYLINDER HEADS, VALVETRAIN COVERS & DUAL IGNITION */}
      <group
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('cylinder_heads_valves');
        }}
      >
        {/* Port Cylinder Heads */}
        {[-0.62, 0.62].map((zOff, idx) => (
          <group key={`p-head-${idx}`} position={[-1.62 - 1.45 * e, 0.05, zOff]}>
            <mesh>
              <boxGeometry args={[0.36, 0.74, 0.74]} />
              <meshStandardMaterial {...matProps('cylinder_heads_valves', '#526075', 0.65, 0.3)} />
            </mesh>
            {/* Valvetrain cover bevel */}
            <mesh position={[-0.19, 0, 0]}>
              <boxGeometry args={[0.06, 0.62, 0.62]} />
              <meshStandardMaterial {...matProps('cylinder_heads_valves', '#334155', 0.7, 0.3)} />
            </mesh>
            {/* Dual Spark Plug Boots */}
            <mesh position={[-0.08, 0.38, 0.15]}>
              <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
            <mesh position={[-0.08, 0.38, -0.15]}>
              <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
          </group>
        ))}
        {/* Starboard Cylinder Heads */}
        {[-0.62, 0.62].map((zOff, idx) => (
          <group key={`s-head-${idx}`} position={[1.62 + 1.45 * e, 0.05, zOff]}>
            <mesh>
              <boxGeometry args={[0.36, 0.74, 0.74]} />
              <meshStandardMaterial {...matProps('cylinder_heads_valves', '#526075', 0.65, 0.3)} />
            </mesh>
            {/* Valvetrain cover bevel */}
            <mesh position={[0.19, 0, 0]}>
              <boxGeometry args={[0.06, 0.62, 0.62]} />
              <meshStandardMaterial {...matProps('cylinder_heads_valves', '#334155', 0.7, 0.3)} />
            </mesh>
            {/* Dual Spark Plug Boots */}
            <mesh position={[0.08, 0.38, 0.15]}>
              <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
            <mesh position={[0.08, 0.38, -0.15]}>
              <cylinderGeometry args={[0.035, 0.035, 0.14, 12]} />
              <meshStandardMaterial color="#1e293b" roughness={0.7} />
            </mesh>
          </group>
        ))}
      </group>

      {/* 6. INTER-CYLINDER AIR COOLING PLENUM & RAM-AIR DUCTS */}
      <group
        position={[0, 0.72 + 0.85 * e, 0]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('cooling_plenum');
        }}
      >
        {/* Central carbon air scoop / distributor */}
        <mesh position={[0, 0.08, -0.15]}>
          <boxGeometry args={[0.92, 0.14, 1.45]} />
          <meshStandardMaterial {...matProps('cooling_plenum', '#1e293b', 0.5, 0.4)} />
        </mesh>
        {/* Port cylinder bank cooling air shroud duct */}
        <mesh position={[-1.12, 0.02, 0]} rotation={[0, 0, -0.08]}>
          <boxGeometry args={[1.05, 0.08, 1.95]} />
          <meshStandardMaterial
            {...matProps('cooling_plenum', '#273549', 0.4, 0.45)}
            transparent
            opacity={0.88}
          />
        </mesh>
        {/* Starboard cylinder bank cooling air shroud duct */}
        <mesh position={[1.12, 0.02, 0]} rotation={[0, 0, 0.08]}>
          <boxGeometry args={[1.05, 0.08, 1.95]} />
          <meshStandardMaterial
            {...matProps('cooling_plenum', '#273549', 0.4, 0.45)}
            transparent
            opacity={0.88}
          />
        </mesh>
        {/* Forward ram-air intake bellmouth */}
        <mesh position={[0, 0.08, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.32, 0.28, 0.35, 20]} />
          <meshStandardMaterial {...matProps('cooling_plenum', '#0f172a', 0.6, 0.3)} />
        </mesh>
      </group>

      {/* 7. DRY-SUMP OIL PUMP, REGULATOR & COOLER CIRCUIT */}
      <group
        position={[0, -0.82 - 0.85 * e, 0]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('lubrication_system');
        }}
      >
        {/* Bottom sump / scavenge manifold */}
        <mesh>
          <boxGeometry args={[1.15, 0.34, 2.2]} />
          <meshStandardMaterial {...matProps('lubrication_system', '#334155', 0.7, 0.35)} />
        </mesh>
        {/* Oil filter canister & regulator housing */}
        <mesh position={[0.48, -0.05, 0.95]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.42, 20]} />
          <meshStandardMaterial {...matProps('lubrication_system', '#0284c7', 0.6, 0.35)} />
        </mesh>
      </group>

      {/* 8. ELECTRONIC FUEL INJECTION RAIL & THROTTLE BODY */}
      <group
        position={[0, 0.55 + 0.5 * e, -0.15]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('fuel_injection_rail');
        }}
      >
        {[-0.85, 0.85].map((xPos, idx) => (
          <mesh key={idx} position={[xPos, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 1.75, 16]} />
            <meshStandardMaterial {...matProps('fuel_injection_rail', '#94a3b8', 0.8, 0.25)} />
          </mesh>
        ))}
        {/* Central throttle body & intake plenum */}
        <mesh position={[0, 0.12, -0.85]}>
          <cylinderGeometry args={[0.26, 0.26, 0.38, 20]} />
          <meshStandardMaterial {...matProps('fuel_injection_rail', '#64748b', 0.75, 0.3)} />
        </mesh>
      </group>

      {/* 9. 4-INTO-1 EXHAUST COLLECTOR & TURBOCHARGER UNIT */}
      <group
        position={[0, -0.35 - 0.45 * e, -1.55 - 0.9 * e]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('exhaust_turbo_unit');
        }}
      >
        {/* Exhaust collector manifold */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.13, 0.13, 2.35, 18]} />
          <meshStandardMaterial {...matProps('exhaust_turbo_unit', '#78716c', 0.65, 0.4)} />
        </mesh>
        {/* Turbocharger turbine & compressor snails */}
        <mesh position={[-0.24, -0.12, -0.25]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.26, 0.11, 16, 28]} />
          <meshStandardMaterial {...matProps('exhaust_turbo_unit', '#57534e', 0.7, 0.35)} />
        </mesh>
        <mesh position={[0.24, -0.12, -0.25]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.26, 0.11, 16, 28]} />
          <meshStandardMaterial {...matProps('exhaust_turbo_unit', '#94a3b8', 0.8, 0.25)} />
        </mesh>
      </group>

      {/* 10. FADEC SENSOR HARNESS & ALTERNATOR BUS */}
      <group
        position={[0, 0.35 + 0.4 * e, -1.42 - 0.55 * e]}
        onClick={(ev) => {
          ev.stopPropagation();
          onSelectSubsystem('sensor_fadec_harness');
        }}
      >
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.28, 0.28, 0.35, 20]} />
          <meshStandardMaterial {...matProps('sensor_fadec_harness', '#0f766e', 0.65, 0.35)} />
        </mesh>
      </group>

      {/* FLOATING TECHNICAL CALLOUT LABELS IN 3D SPACE */}
      {showLabels && (
        <>
          <Html position={[-1.75 - 1.45 * e, 0.65, 0.62]} center>
            <div
              onClick={() => onSelectSubsystem('cylinder_heads_valves')}
              style={{
                background: 'rgba(6, 9, 17, 0.92)',
                border: `1px solid ${
                  subsystemStates.cylinder_heads_valves.status === 'CRITICAL'
                    ? '#ef4444'
                    : subsystemStates.cylinder_heads_valves.status === 'WARNING'
                    ? '#f59e0b'
                    : '#38bdf8'
                }`,
                color: '#f1f5f9',
                padding: '3px 7px',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 8.5, color: '#94a3b8', fontStyle: 'italic', marginBottom: 2 }}>
                Inferred from lumped telemetry - not sensor-localized
              </div>
              <div>
                CHT: {twinState?.actual.cht_c.toFixed(1)}°C (Δ
                {twinState && twinState.calculated.cht_residual_c >= 0 ? '+' : ''}
                {twinState?.calculated.cht_residual_c.toFixed(1)}°C)
              </div>
            </div>
          </Html>

          <Html position={[0, -1.18 - 0.85 * e, 0.5]} center>
            <div
              onClick={() => onSelectSubsystem('lubrication_system')}
              style={{
                background: 'rgba(6, 9, 17, 0.92)',
                border: `1px solid ${
                  subsystemStates.lubrication_system.status === 'CRITICAL'
                    ? '#ef4444'
                    : subsystemStates.lubrication_system.status === 'WARNING'
                    ? '#f59e0b'
                    : '#10b981'
                }`,
                color: '#f1f5f9',
                padding: '3px 7px',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 8.5, color: '#94a3b8', fontStyle: 'italic', marginBottom: 2 }}>
                Inferred from lumped telemetry - not sensor-localized
              </div>
              <div>
                OIL: {twinState?.actual.oil_pressure_bar.toFixed(2)} bar |{' '}
                {twinState?.actual.oil_temp_c.toFixed(1)}°C
              </div>
            </div>
          </Html>

          <Html position={[0, -0.65 - 0.45 * e, -1.85 - 0.9 * e]} center>
            <div
              onClick={() => onSelectSubsystem('exhaust_turbo_unit')}
              style={{
                background: 'rgba(6, 9, 17, 0.92)',
                border: `1px solid ${
                  subsystemStates.exhaust_turbo_unit.status !== 'NOMINAL'
                    ? '#f59e0b'
                    : '#64748b'
                }`,
                color: '#f1f5f9',
                padding: '3px 7px',
                borderRadius: 4,
                fontSize: 10,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 8.5, color: '#94a3b8', fontStyle: 'italic', marginBottom: 2 }}>
                Inferred from lumped telemetry - not sensor-localized
              </div>
              <div>
                EGT: {twinState?.actual.egt_c.toFixed(0)}°C | σ=
                {twinState?.expected.air_density_ratio.toFixed(2)}
              </div>
            </div>
          </Html>
        </>
      )}
    </group>
  );
};

/* =========================================================================
   WEBGL ERROR BOUNDARY & GRACEFUL 2D BLUEPRINT SCHEMATIC FALLBACK
   ========================================================================= */
class WebGLErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function isWebGLSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

/* =========================================================================
   EXPORTED INTERACTIVE 3D ENGINE DIGITAL TWIN WORKSPACE COMPONENT
   ========================================================================= */
export const Engine3DViewport: React.FC<{
  twinState: FourValueDigitalTwinState | null;
  engineHours?: number;
  compact?: boolean;
  wireframe?: boolean;
  showControls?: boolean;
  selectedSubsystemId?: EngineSubsystemId;
  onSubsystemChange?: (id: EngineSubsystemId) => void;
}> = ({
  twinState,
  engineHours = 420.0,
  compact = false,
  wireframe: controlledWireframe,
  showControls,
  selectedSubsystemId,
  onSubsystemChange,
}) => {
  const [internalSubsystem, setInternalSubsystem] =
    useState<EngineSubsystemId>('cylinder_heads_valves');
  const selectedSubsystem = selectedSubsystemId ?? internalSubsystem;

  const handleSelectSubsystem = (id: EngineSubsystemId) => {
    setInternalSubsystem(id);
    if (onSubsystemChange) {
      onSubsystemChange(id);
    }
  };

  const [explodeFactor, setExplodeFactor] = useState<number>(0.0);
  const [internalWireframe, setInternalWireframe] = useState<boolean>(false);
  const wireframe = controlledWireframe !== undefined ? controlledWireframe : internalWireframe;
  const setWireframe = setInternalWireframe;
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [animateKinematics, setAnimateKinematics] = useState<boolean>(true);
  const [cameraResetKey, setCameraResetKey] = useState<number>(0);
  const [cameraPos, setCameraPos] = useState<[number, number, number]>([
    3.1, 1.8, 3.3,
  ]);
  const [webglAvailable, setWebglAvailable] = useState<boolean>(true);

  useEffect(() => {
    setWebglAvailable(isWebGLSupported());
  }, []);

  const subsystemStates = useMemo(
    () => evaluateSubsystemStates(twinState),
    [twinState]
  );

  // Auto-select the primary faulted subsystem when a non-normal fault occurs
  useEffect(() => {
    if (!twinState) return;
    const fc = twinState.predicted.predicted_fault_class;
    let nextSub: EngineSubsystemId | null = null;
    if (fc === 'Cylinder Overheating' || fc === 'Valve Clearance Issue') {
      nextSub = 'cylinder_heads_valves';
    } else if (fc === 'Oil Pressure Drop') {
      nextSub = 'lubrication_system';
    } else if (fc === 'Crankshaft Bearing Wear') {
      nextSub = 'crankshaft_train';
    } else if (fc === 'Piston Ring Wear' || fc === 'Cylinder Misfire') {
      nextSub = 'cylinder_bank_port';
    } else if (fc === 'Fuel Injector Clogging') {
      nextSub = 'fuel_injection_rail';
    } else if (fc === 'Sensor Fault') {
      nextSub = 'sensor_fadec_harness';
    }
    if (nextSub) {
      setInternalSubsystem(nextSub);
      if (onSubsystemChange) onSubsystemChange(nextSub);
    }
  }, [twinState?.predicted.predicted_fault_class]);

  const selectedMeta =
    ENGINE_SUBSYSTEMS.find((s) => s.id === selectedSubsystem) ||
    ENGINE_SUBSYSTEMS[0];
  const selectedStatus = subsystemStates[selectedSubsystem];

  const handleCameraPreset = (pos: [number, number, number]) => {
    setCameraPos(pos);
    setCameraResetKey((k) => k + 1);
  };

  const fallbackSchematic = (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        color: '#cbd5e1',
      }}
    >
      <div className="badge badge-info" style={{ marginBottom: 8 }}>
        2D TECHNICAL SCHEMATIC FALLBACK (WEBGL CONTEXT UNAVAILABLE)
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12, textAlign: 'center' }}>
        Interactive 2D component selector active. Select any propulsion subsystem below to inspect telemetry and fault state.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          width: '100%',
          maxWidth: 540,
        }}
      >
        {ENGINE_SUBSYSTEMS.map((sub) => {
          const st = subsystemStates[sub.id].status;
          return (
            <button
              key={sub.id}
              className={`comp-tree-btn ${
                selectedSubsystem === sub.id ? 'selected' : ''
              }`}
              onClick={() => handleSelectSubsystem(sub.id)}
            >
              <span>
                {sub.code}: {sub.name}
              </span>
              <span className="mono">{st}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const shouldShowControls = showControls !== undefined ? showControls : !compact;

  if (compact) {
    return (
      <div
        className="twin-canvas-container"
        style={{
          width: '100%',
          height: '100%',
          minHeight: 380,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          marginBottom: 0,
        }}
      >
        {shouldShowControls && (
          <div className="twin-viewport-hud-top">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge badge-info">
                  3D PROCEDURAL BOXER TWIN
                </span>
                <span className="badge badge-synthetic">
                  {twinState
                    ? twinState.is_synthetic
                      ? 'SYNTHETIC TELEMETRY'
                      : 'RECORDED TELEMETRY'
                    : 'AWAITING TELEMETRY'}
                </span>
                {twinState && (
                  <span
                    className={
                      twinState.predicted.predicted_fault_class === 'Normal'
                        ? 'badge badge-nominal'
                        : twinState.predicted.health_index < 48
                        ? 'badge badge-critical'
                        : 'badge badge-warning'
                    }
                  >
                    {twinState.predicted.predicted_fault_class}
                  </span>
                )}
              </div>
              <div className="mono" style={{ fontSize: 11, color: '#94a3b8' }}>
                {twinState ? (
                  <>
                    RPM: {twinState.actual.rpm.toFixed(0)} · CHT:{' '}
                    {twinState.actual.cht_c.toFixed(1)}°C · Oil P:{' '}
                    {twinState.actual.oil_pressure_bar.toFixed(2)} bar · Vib:{' '}
                    {twinState.actual.vibration_rms_mms.toFixed(2)} mm/s
                  </>
                ) : (
                  'Telemetry state unavailable — showing reference geometry'
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button
                className="btn btn-sm"
                onClick={() => handleCameraPreset([3.1, 1.8, 3.3])}
                title="Reset Isometric Camera"
              >
                <RotateCcw size={11} /> Iso
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleCameraPreset([0, 4.4, 0.01])}
                title="Top Plan View"
              >
                Top
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleCameraPreset([0, 0.35, 4.2])}
                title="Front Propeller View"
              >
                Front
              </button>
              <button
                className="btn btn-sm"
                onClick={() => handleCameraPreset([4.2, 0.4, 0])}
                title="Side Cylinder View"
              >
                Side
              </button>
              <button
                className={`btn btn-sm ${showLabels ? 'btn-primary' : ''}`}
                onClick={() => setShowLabels((l) => !l)}
              >
                <Eye size={11} /> Labels
              </button>
              <button
                className={`btn btn-sm ${explodeFactor > 0 ? 'btn-primary' : ''}`}
                onClick={() => setExplodeFactor((v) => (v > 0 ? 0 : 0.65))}
              >
                <Layers size={11} /> {explodeFactor > 0 ? 'Assemble' : 'Explode'}
              </button>
            </div>
          </div>
        )}
        {webglAvailable ? (
          <WebGLErrorBoundary fallback={fallbackSchematic}>
            <Canvas
              key={cameraResetKey}
              camera={{ position: cameraPos, fov: 34, near: 0.1, far: 1000 }}
              gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
              style={{ width: '100%', height: '100%', flex: 1, minHeight: 330, display: 'block' }}
            >
              <ambientLight intensity={0.8} />
              <directionalLight position={[6, 8, 5]} intensity={1.5} />
              <directionalLight position={[-6, -4, -4]} intensity={0.65} color="#36d9ff" />
              <pointLight position={[0, 0, 0]} intensity={0.4} color="#36d9ff" />
              <gridHelper
                args={[10, 20, '#1d3166', '#0d152a']}
                position={[0, -1.45, 0]}
              />
              <ProceduralAeroEngineScene
                twinState={twinState}
                subsystemStates={subsystemStates}
                selectedSubsystem={selectedSubsystem}
                onSelectSubsystem={handleSelectSubsystem}
                explodeFactor={explodeFactor}
                wireframe={wireframe}
                showLabels={showLabels}
                animateKinematics={animateKinematics}
              />
              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.08}
                target={[0, 0.05, 0]}
                minDistance={1.2}
                maxDistance={18}
              />
            </Canvas>
          </WebGLErrorBoundary>
        ) : (
          fallbackSchematic
        )}
        {shouldShowControls && (
          <div className="twin-viewport-hud-bottom">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="badge badge-info">{selectedMeta.code}</span>
              <strong style={{ fontSize: 11.5, color: '#ffffff' }}>
                {selectedMeta.name}
              </strong>
              <span
                className={
                  selectedStatus.status === 'CRITICAL'
                    ? 'badge badge-critical'
                    : selectedStatus.status === 'WARNING'
                    ? 'badge badge-warning'
                    : 'badge badge-nominal'
                }
              >
                {selectedStatus.status}
              </span>
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
              {selectedStatus.reason} · Click any 3D component to inspect
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="twin-3d-workspace">
      {/* LEFT PANEL: COMPACT SUBSYSTEM HIERARCHY TREE */}
      <div className="twin-hierarchy-panel">
        <div className="panel-card-header" style={{ marginBottom: 4 }}>
          <div className="panel-card-title">
            <Layers size={13} /> Engine Component Tree
          </div>
          <span className="mono" style={{ fontSize: 10, color: '#94a3b8' }}>
            10 Subsystems
          </span>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {ENGINE_SUBSYSTEMS.map((sub) => {
            const st = subsystemStates[sub.id].status;
            const dotColor =
              st === 'CRITICAL'
                ? '#ef4444'
                : st === 'WARNING'
                ? '#f59e0b'
                : '#10b981';
            const faultCls =
              st === 'CRITICAL'
                ? 'fault-critical'
                : st === 'WARNING'
                ? 'fault-warning'
                : '';
            return (
              <button
                key={sub.id}
                className={`comp-tree-btn ${
                  selectedSubsystem === sub.id ? 'selected' : ''
                } ${faultCls}`}
                onClick={() => handleSelectSubsystem(sub.id)}
              >
                <div style={{ paddingRight: 6 }}>
                  <div
                    className="mono"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    {sub.code} • {sub.subsystemGroup}
                  </div>
                  <div>{sub.name}</div>
                </div>
                <span
                  className="comp-status-dot"
                  style={{ backgroundColor: dotColor }}
                  title={st}
                />
              </button>
            );
          })}
        </div>

        <div
          className="mono"
          style={{
            fontSize: 10,
            color: '#94a3b8',
            borderTop: '1px solid #1c2942',
            paddingTop: 6,
          }}
        >
          <div style={{ color: 'var(--cyan)', marginBottom: 2 }}>
            Subsystem status is inferred from lumped engine residuals.
          </div>
          <div>
            MODEL DISCLOSURE: Simplified procedural 4-cylinder boxer turbo
            geometry. Not dimensionally certified Rotax CAD.
          </div>
        </div>
      </div>

      {/* CENTER PANEL: INTERACTIVE 3D WEBGL VIEWPORT */}
      <div className="twin-canvas-container">
        <div className="twin-viewport-hud-top">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span className="badge badge-info">
                PROCEDURAL 4-CYL TURBO BOXER TWIN
              </span>
              <span className="badge badge-synthetic">
                {twinState?.is_synthetic ? 'SYNTHETIC TELEMETRY' : 'RECORDED'}
              </span>
              {twinState && (
                <span
                  className={
                    twinState.predicted.predicted_fault_class === 'Normal'
                      ? 'badge badge-nominal'
                      : twinState.predicted.health_index < 48
                      ? 'badge badge-critical'
                      : 'badge badge-warning'
                  }
                >
                  STATE: {twinState.predicted.predicted_fault_class}
                </span>
              )}
            </div>
            <div className="mono" style={{ fontSize: 11, color: '#94a3b8' }}>
              RPM: {twinState?.actual.rpm.toFixed(0)} | Load:{' '}
              {twinState?.actual.engine_load_pct.toFixed(1)}% | Alt:{' '}
              {twinState?.actual.altitude_m.toFixed(0)}m | Hours:{' '}
              {engineHours.toFixed(1)}h
            </div>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              className="btn"
              onClick={() => handleCameraPreset([3.1, 1.8, 3.3])}
              title="Reset Isometric Camera"
            >
              <RotateCcw size={12} /> Iso
            </button>
            <button
              className="btn"
              onClick={() => handleCameraPreset([0, 4.4, 0.01])}
              title="Top Plan View"
            >
              <Camera size={12} /> Top
            </button>
            <button
              className="btn"
              onClick={() => handleCameraPreset([0, 0.35, 4.2])}
              title="Front Propeller View"
            >
              Front
            </button>
            <button
              className="btn"
              onClick={() => handleCameraPreset([4.2, 0.4, 0])}
              title="Side Cylinder Bank View"
            >
              Side
            </button>
            <button
              className={`btn ${wireframe ? 'btn-primary' : ''}`}
              onClick={() => setWireframe((w) => !w)}
            >
              <Box size={12} /> Wireframe
            </button>
            <button
              className={`btn ${showLabels ? 'btn-primary' : ''}`}
              onClick={() => setShowLabels((l) => !l)}
            >
              <Eye size={12} /> Labels
            </button>
            <button
              className={`btn ${animateKinematics ? 'btn-primary' : ''}`}
              onClick={() => setAnimateKinematics((a) => !a)}
            >
              {animateKinematics ? <Pause size={12} /> : <Play size={12} />}{' '}
              {animateKinematics ? 'Live RPM' : 'Paused'}
            </button>
          </div>
        </div>

        {webglAvailable ? (
          <WebGLErrorBoundary fallback={fallbackSchematic}>
            <Canvas
              key={cameraResetKey}
              camera={{ position: cameraPos, fov: 34, near: 0.1, far: 1000 }}
              gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
              style={{ width: '100%', height: '100%', flex: 1, minHeight: 440, display: 'block' }}
            >
              <ambientLight intensity={0.8} />
              <directionalLight position={[6, 8, 5]} intensity={1.5} />
              <directionalLight
                position={[-6, -4, -4]}
                intensity={0.65}
                color="#36d9ff"
              />
              <pointLight position={[0, 0, 0]} intensity={0.4} color="#36d9ff" />
              <gridHelper
                args={[10, 20, '#1d3166', '#0d152a']}
                position={[0, -1.45, 0]}
              />
              <ProceduralAeroEngineScene
                twinState={twinState}
                subsystemStates={subsystemStates}
                selectedSubsystem={selectedSubsystem}
                onSelectSubsystem={handleSelectSubsystem}
                explodeFactor={explodeFactor}
                wireframe={wireframe}
                showLabels={showLabels}
                animateKinematics={animateKinematics}
              />
              <OrbitControls
                makeDefault
                enableDamping
                dampingFactor={0.08}
                target={[0, 0.05, 0]}
                minDistance={1.2}
                maxDistance={18}
              />
            </Canvas>
          </WebGLErrorBoundary>
        ) : (
          fallbackSchematic
        )}

        <div className="twin-viewport-hud-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Maximize2 size={13} color="#38bdf8" />
            <span className="mono" style={{ fontSize: 11 }}>
              Exploded Assembly View: {(explodeFactor * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(explodeFactor * 100)}
            onChange={(e) => setExplodeFactor(Number(e.target.value) / 100)}
            style={{ width: 170, accentColor: '#38bdf8' }}
          />
          <button
            className="btn"
            onClick={() => setExplodeFactor((v) => (v > 0 ? 0.0 : 0.75))}
          >
            {explodeFactor > 0 ? 'Collapse Assembly' : 'Explode Subsystems'}
          </button>
          <span className="mono" style={{ fontSize: 10.5, color: '#94a3b8' }}>
            LMB: Orbit | RMB: Pan | Scroll: Zoom | Click Mesh: Inspect
          </span>
        </div>
      </div>

      {/* RIGHT PANEL: CONTEXTUAL SUBSYSTEM ENGINEERING INSPECTOR */}
      <div className="twin-inspector-panel">
        <div className="panel-card-header" style={{ marginBottom: 4 }}>
          <div className="panel-card-title">
            <Cpu size={13} /> Subsystem Inspector
          </div>
          <span
            className={
              selectedStatus.status === 'CRITICAL'
                ? 'badge badge-critical'
                : selectedStatus.status === 'WARNING'
                ? 'badge badge-warning'
                : 'badge badge-nominal'
            }
          >
            {selectedStatus.status}
          </span>
        </div>

        <div>
          <div
            className="mono"
            style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 700 }}
          >
            {selectedMeta.code} • {selectedMeta.subsystemGroup}
          </div>
          <div
            style={{
              fontSize: 13.5,
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginBottom: 4,
            }}
          >
            {selectedMeta.name}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: 'var(--text-secondary)',
              marginBottom: 8,
            }}
          >
            {selectedMeta.description}
          </div>
        </div>

        <div className="twin-inspector-detail-card">
          <div className="kpi-label">Active State & Localization Basis</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
            {selectedStatus.reason}
          </div>
          <div
            style={{
              fontSize: 10.5,
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            {selectedMeta.localizationDisclosure}
          </div>
        </div>

        {twinState && (
          <div>
            <div className="kpi-label" style={{ marginTop: 4 }}>
              Synchronized 4-Value Telemetry Comparison
              <span style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>
                (ΔRes colors: UI display bands [indicative])
              </span>
            </div>
            <table className="eng-table mono" style={{ fontSize: 11 }}>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Actual</th>
                  <th>Ref</th>
                  <th>ΔRes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>CHT (°C)</td>
                  <td>{twinState.actual.cht_c.toFixed(1)}</td>
                  <td>{twinState.expected.cht_c.toFixed(1)}</td>
                  <td
                    style={{
                      color:
                        Math.abs(twinState.calculated.cht_residual_c) > 12
                          ? '#f59e0b'
                          : '#cbd5e1',
                    }}
                  >
                    {twinState.calculated.cht_residual_c >= 0 ? '+' : ''}
                    {twinState.calculated.cht_residual_c.toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td>EGT (°C)</td>
                  <td>{twinState.actual.egt_c.toFixed(0)}</td>
                  <td>{twinState.expected.egt_c.toFixed(0)}</td>
                  <td>
                    {twinState.calculated.egt_residual_c >= 0 ? '+' : ''}
                    {twinState.calculated.egt_residual_c.toFixed(0)}
                  </td>
                </tr>
                <tr>
                  <td>Oil P (bar)</td>
                  <td>{twinState.actual.oil_pressure_bar.toFixed(2)}</td>
                  <td>{twinState.expected.oil_pressure_bar.toFixed(2)}</td>
                  <td
                    style={{
                      color:
                        twinState.calculated.oil_pressure_residual_bar < -0.5
                          ? '#ef4444'
                          : '#cbd5e1',
                    }}
                  >
                    {twinState.calculated.oil_pressure_residual_bar >= 0
                      ? '+'
                      : ''}
                    {twinState.calculated.oil_pressure_residual_bar.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td>Oil T (°C)</td>
                  <td>{twinState.actual.oil_temp_c.toFixed(1)}</td>
                  <td>{twinState.expected.oil_temp_c.toFixed(1)}</td>
                  <td>
                    {twinState.calculated.oil_temp_residual_c >= 0 ? '+' : ''}
                    {twinState.calculated.oil_temp_residual_c.toFixed(1)}
                  </td>
                </tr>
                <tr>
                  <td>Vib (mm/s)</td>
                  <td>{twinState.actual.vibration_rms_mms.toFixed(2)}</td>
                  <td>{twinState.expected.vibration_rms_mms.toFixed(2)}</td>
                  <td
                    style={{
                      color:
                        twinState.calculated.vibration_residual_mms > 1.2
                          ? '#f59e0b'
                          : '#cbd5e1',
                    }}
                  >
                    {twinState.calculated.vibration_residual_mms >= 0
                      ? '+'
                      : ''}
                    {twinState.calculated.vibration_residual_mms.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td>Fuel (L/h)</td>
                  <td>{twinState.actual.fuel_flow_lph.toFixed(1)}</td>
                  <td>{twinState.expected.fuel_flow_lph.toFixed(1)}</td>
                  <td>
                    {twinState.calculated.fuel_flow_residual_lph >= 0
                      ? '+'
                      : ''}
                    {twinState.calculated.fuel_flow_residual_lph.toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 'auto' }}>
          <div className="kpi-label">Associated Fault Modes</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {selectedMeta.relatedFaultClasses.map((fc) => (
              <span key={fc} className="badge badge-synthetic">
                {fc}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
