import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AuditRunResult,
  MitigationConfig,
  ProtectedRegistry,
} from '../core/types';
import {
  buildSceneTelemetrySnapshot,
  CAMERA_BOOKMARKS,
  CameraBookmarkId,
  Node3DDescriptor,
  PURDUE_LEVEL_SPECS,
  Scene3DTelemetrySnapshot,
  ThermalShaderMode,
  VisualSceneMode,
} from '../core/purdue3dEngine';

interface ThreeDPlantTopologyStudioProps {
  auditResult: AuditRunResult;
  mitigationConfig: MitigationConfig;
  registry: ProtectedRegistry;
  selectedCaseId: string;
  onSelectCaseId: (caseId: string) => void;
  onToggleMitigationPolicy: (key: keyof MitigationConfig) => void;
  onApplyAllMitigations: () => void;
  onResetBaseline: () => void;
}

// Pre-allocated module-scope vectors to avoid GC in the animation loop
const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecMid = new THREE.Vector3();
const _tmpColor = new THREE.Color();

function createHolographicLabelSprite(
  title: string,
  subtitle: string,
  borderColorHex: string,
  bgColorHex = '#0f172a',
  maxAnisotropy = 4
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bgColorHex;
    ctx.beginPath();
    ctx.roundRect(6, 6, 500, 116, 14);
    ctx.fill();

    ctx.lineWidth = 5;
    ctx.strokeStyle = borderColorHex;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillText(title.slice(0, 32), 24, 52);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 21px "JetBrains Mono", monospace';
    ctx.fillText(subtitle.slice(0, 42), 24, 92);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(4.5, 1.12, 1);
  sprite.renderOrder = 25;
  return sprite;
}

/**
 * Builds composite 6-10 part procedural 3D meshes for each of the 6 OT devices
 * following the Three.js Skill Composite Procedural Model directive.
 */
function buildCompositeIndustrialAsset(
  deviceId: string,
  isSoftwareGl: boolean
): {
  root: THREE.Group;
  primaryMeshes: THREE.Mesh[];
  animatedRotor?: THREE.Object3D;
  waterWaveMesh?: THREE.Mesh;
  glitchWireframe: THREE.LineSegments;
  statusBeacon: THREE.Mesh;
  hitProxy: THREE.Mesh;
} {
  const root = new THREE.Group();
  root.name = `ASSET-${deviceId}`;
  const primaryMeshes: THREE.Mesh[] = [];

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    metalness: 0.78,
    roughness: 0.28,
  });
  const darkCastMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.65,
    roughness: 0.55,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    metalness: 0.55,
    roughness: 0.32,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    metalness: 0.85,
    roughness: 0.22,
  });

  // Ground contact shadow pad
  const shadowGeo = new THREE.CircleGeometry(2.1, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x020617,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowPad = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPad.position.y = 0.02;
  root.add(shadowPad);

  // Pedestal base
  const baseGeo = new THREE.BoxGeometry(2.8, 0.26, 2.4);
  const baseMesh = new THREE.Mesh(baseGeo, darkCastMat.clone());
  baseMesh.position.y = 0.13;
  baseMesh.castShadow = !isSoftwareGl;
  baseMesh.receiveShadow = !isSoftwareGl;
  root.add(baseMesh);
  primaryMeshes.push(baseMesh);

  let animatedRotor: THREE.Object3D | undefined;
  let waterWaveMesh: THREE.Mesh | undefined;

  if (deviceId === 'P-101') {
    // 1. Centrifugal Impeller Pump with spinning 6-blade rotor & suction/discharge pipes
    const motorHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 1.35, 20),
      accentMat.clone()
    );
    motorHousing.rotation.z = Math.PI / 2;
    motorHousing.position.set(-0.45, 0.92, 0);
    root.add(motorHousing);
    primaryMeshes.push(motorHousing);

    // Cooling fins
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.68, 0.68, 0.08, 16),
        steelMat.clone()
      );
      fin.rotation.z = Math.PI / 2;
      fin.position.set(-0.8 + i * 0.22, 0.92, 0);
      root.add(fin);
      primaryMeshes.push(fin);
    }

    // Volute chamber
    const volute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.78, 0.78, 0.55, 24),
      steelMat.clone()
    );
    volute.rotation.x = Math.PI / 2;
    volute.position.set(0.55, 0.95, 0);
    root.add(volute);
    primaryMeshes.push(volute);

    // Spinning 6-blade impeller rotor inside inspection front
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(0.55, 0.95, 0.32);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.16, 12), copperMat.clone());
    hub.rotation.x = Math.PI / 2;
    rotorGroup.add(hub);
    for (let b = 0; b < 6; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.08), copperMat.clone());
      blade.rotation.z = (b * Math.PI) / 3;
      rotorGroup.add(blade);
    }
    root.add(rotorGroup);
    animatedRotor = rotorGroup;

    // Discharge vertical flange pipe
    const dischargePipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 1.25, 16),
      steelMat.clone()
    );
    dischargePipe.position.set(0.55, 1.75, 0);
    root.add(dischargePipe);
    primaryMeshes.push(dischargePipe);
  } else if (deviceId === 'C-201') {
    // 2. Modular PLC Rack with DIN backplane and 4 I/O slots + LEDs
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.2, 1.2),
      steelMat.clone()
    );
    cabinet.position.set(0, 1.36, 0);
    root.add(cabinet);
    primaryMeshes.push(cabinet);

    for (let slot = 0; slot < 4; slot++) {
      const ioModule = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 1.75, 0.25),
        darkCastMat.clone()
      );
      ioModule.position.set(-0.72 + slot * 0.48, 1.38, 0.56);
      root.add(ioModule);
      primaryMeshes.push(ioModule);

      // Blinking status LED strip per slot
      const ledMat = new THREE.MeshBasicMaterial({
        color: slot % 2 === 0 ? 0x10b981 : 0x38bdf8,
      });
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.05), ledMat);
      led.position.set(-0.72 + slot * 0.48, 2.02, 0.7);
      root.add(led);
    }
  } else if (deviceId === 'V-302') {
    // 3. Motorized Relief Valve with actuator diaphragm dome & handwheel
    const pipeBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.38, 2.2, 18),
      steelMat.clone()
    );
    pipeBody.rotation.z = Math.PI / 2;
    pipeBody.position.set(0, 0.75, 0);
    root.add(pipeBody);
    primaryMeshes.push(pipeBody);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.1, 14),
      copperMat.clone()
    );
    stem.position.set(0, 1.4, 0);
    root.add(stem);
    primaryMeshes.push(stem);

    const diaphragmDome = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.55, 0.45, 20),
      accentMat.clone()
    );
    diaphragmDome.position.set(0, 2.05, 0);
    root.add(diaphragmDome);
    primaryMeshes.push(diaphragmDome);

    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(0, 2.45, 0);
    const wheelRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.06, 10, 24),
      copperMat.clone()
    );
    wheelRim.rotation.x = Math.PI / 2;
    wheelGroup.add(wheelRim);
    root.add(wheelGroup);
    animatedRotor = wheelGroup;
  } else if (deviceId === 'T-404') {
    // 4. Clarifier Tank with dynamic 3D water surface wave shader & rotating bridge
    const tankWall = new THREE.Mesh(
      new THREE.CylinderGeometry(1.45, 1.45, 1.65, 28, 1, true),
      steelMat.clone()
    );
    tankWall.position.set(0, 1.08, 0);
    root.add(tankWall);
    primaryMeshes.push(tankWall);

    const waterGeo = new THREE.CircleGeometry(1.38, 28);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      metalness: 0.2,
      roughness: 0.15,
      transparent: true,
      opacity: 0.85,
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(0, 1.68, 0);
    root.add(waterMesh);
    waterWaveMesh = waterMesh;

    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(0, 1.98, 0);
    const truss = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.36), copperMat.clone());
    bridgeGroup.add(truss);
    const ultrasonicHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.42, 14),
      accentMat.clone()
    );
    ultrasonicHead.rotation.x = Math.PI;
    ultrasonicHead.position.set(0.85, -0.18, 0);
    bridgeGroup.add(ultrasonicHead);
    root.add(bridgeGroup);
    animatedRotor = bridgeGroup;
  } else if (deviceId === 'GW-500') {
    // 5. Industrial Firewall Gateway with dual antennas & optical ports
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.35, 1.5),
      darkCastMat.clone()
    );
    chassis.position.set(0, 0.95, 0);
    root.add(chassis);
    primaryMeshes.push(chassis);

    const faceplate = new THREE.Mesh(
      new THREE.BoxGeometry(2.15, 0.95, 0.12),
      accentMat.clone()
    );
    faceplate.position.set(0, 0.95, 0.76);
    root.add(faceplate);
    primaryMeshes.push(faceplate);

    for (const xOff of [-0.75, 0.75]) {
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 1.15, 10),
        copperMat.clone()
      );
      ant.position.set(xOff, 2.1, -0.4);
      root.add(ant);
      primaryMeshes.push(ant);
    }
  } else {
    // 6. HIST-601 Server Blade Rack with 6 hot-swap blades
    const rackFrame = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 2.65, 1.6),
      darkCastMat.clone()
    );
    rackFrame.position.set(0, 1.58, 0);
    root.add(rackFrame);
    primaryMeshes.push(rackFrame);

    for (let b = 0; b < 5; b++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(1.75, 0.32, 0.15),
        steelMat.clone()
      );
      blade.position.set(0, 0.65 + b * 0.44, 0.78);
      root.add(blade);
      primaryMeshes.push(blade);
    }
  }

  // Cyber-Physical State Desync Holographic Wireframe Glitch Overlay
  const glitchBoxGeo = new THREE.BoxGeometry(3.25, 3.1, 2.85);
  const glitchEdges = new THREE.EdgesGeometry(glitchBoxGeo);
  const glitchMat = new THREE.LineBasicMaterial({
    color: 0xef4444,
    transparent: true,
    opacity: 0.95,
  });
  const glitchWireframe = new THREE.LineSegments(glitchEdges, glitchMat);
  glitchWireframe.position.y = 1.6;
  glitchWireframe.visible = false;
  root.add(glitchWireframe);

  // Top Vulnerability / Hardened Status Beacon
  const beaconGeo = new THREE.OctahedronGeometry(0.28, 1);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 0.8,
    roughness: 0.2,
    metalness: 0.3,
  });
  const statusBeacon = new THREE.Mesh(beaconGeo, beaconMat);
  statusBeacon.position.set(0, 3.15, 0);
  root.add(statusBeacon);

  // Simplified Hit Proxy for fast Raycasting (Layer 1)
  const hitGeo = new THREE.BoxGeometry(3.2, 3.4, 2.8);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitProxy = new THREE.Mesh(hitGeo, hitMat);
  hitProxy.position.y = 1.7;
  hitProxy.layers.enable(1);
  hitProxy.userData = { deviceId };
  root.add(hitProxy);

  return {
    root,
    primaryMeshes,
    animatedRotor,
    waterWaveMesh,
    glitchWireframe,
    statusBeacon,
    hitProxy,
  };
}

export const ThreeDPlantTopologyStudio: React.FC<ThreeDPlantTopologyStudioProps> = ({
  auditResult,
  mitigationConfig,
  registry,
  selectedCaseId,
  onSelectCaseId,
  onToggleMitigationPolicy,
  onApplyAllMitigations,
  onResetBaseline,
}) => {
  const [visualMode, setVisualMode] = useState<VisualSceneMode>('plant_floor');
  const [shaderMode, setShaderMode] = useState<ThermalShaderMode>('standard_pbr');
  const [activeBookmark, setActiveBookmark] = useState<CameraBookmarkId>('isometric_plant');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('P-101');
  const [faultInjectedDevices, setFaultInjectedDevices] = useState<string[]>([]);

  // DVR Time-Scrubber State
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [isPlayingDvr, setIsPlayingDvr] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isBottomDockCollapsed, setIsBottomDockCollapsed] = useState<boolean>(false);
  const [snapshotNotice, setSnapshotNotice] = useState<string | null>(null);

  const snapshot: Scene3DTelemetrySnapshot = useMemo(
    () =>
      buildSceneTelemetrySnapshot(
        auditResult,
        mitigationConfig,
        registry,
        selectedCaseId,
        activeStepIndex,
        visualMode,
        faultInjectedDevices
      ),
    [
      auditResult,
      mitigationConfig,
      registry,
      selectedCaseId,
      activeStepIndex,
      visualMode,
      faultInjectedDevices,
    ]
  );

  const selectedNode: Node3DDescriptor = useMemo(
    () => snapshot.nodes.find((n) => n.id === selectedDeviceId) ?? snapshot.nodes[0],
    [snapshot.nodes, selectedDeviceId]
  );

  // Reset step index when switching test cases
  useEffect(() => {
    setActiveStepIndex(0);
  }, [selectedCaseId]);

  // DVR Playback Timer
  useEffect(() => {
    if (!isPlayingDvr || snapshot.totalStepsInCase <= 1) return;
    const intervalMs = Math.max(450, Math.round(1800 / playbackSpeed));
    const timer = window.setInterval(() => {
      setActiveStepIndex((prev) => (prev + 1) % snapshot.totalStepsInCase);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlayingDvr, playbackSpeed, snapshot.totalStepsInCase]);

  // Mutable ref holding latest snapshot & UI state so WebGL loop never tears down on React updates
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const latestStateRef = useRef({
    snapshot,
    shaderMode,
    selectedDeviceId,
    playbackSpeed,
    cameraTransition: null as { pos: THREE.Vector3; target: THREE.Vector3 } | null,
  });

  useEffect(() => {
    latestStateRef.current.snapshot = snapshot;
    latestStateRef.current.shaderMode = shaderMode;
    latestStateRef.current.selectedDeviceId = selectedDeviceId;
    latestStateRef.current.playbackSpeed = playbackSpeed;
  }, [snapshot, shaderMode, selectedDeviceId, playbackSpeed]);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const triggerCameraPreset = (bookmarkId: CameraBookmarkId, customDevicePos?: { x: number; y: number; z: number }) => {
    setActiveBookmark(bookmarkId);
    if (bookmarkId === 'first_person_device' && customDevicePos) {
      latestStateRef.current.cameraTransition = {
        pos: new THREE.Vector3(customDevicePos.x + 4.8, customDevicePos.y + 3.6, customDevicePos.z + 5.6),
        target: new THREE.Vector3(customDevicePos.x, customDevicePos.y + 1.2, customDevicePos.z),
      };
      return;
    }
    const spec = CAMERA_BOOKMARKS[bookmarkId];
    latestStateRef.current.cameraTransition = {
      pos: new THREE.Vector3(spec.position.x, spec.position.y, spec.position.z),
      target: new THREE.Vector3(spec.target.x, spec.target.y, spec.target.z),
    };
  };

  const handleModeButton = (mode: VisualSceneMode) => {
    setVisualMode(mode);
    if (mode === 'purdue_stack') {
      triggerCameraPreset('purdue_stack');
    } else if (mode === 'plant_floor') {
      triggerCameraPreset('isometric_plant');
    } else {
      triggerCameraPreset('isometric_plant');
    }
  };

  const handleExportSnapshotPng = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Render synchronously right before toDataURL per Three.js skill instructions
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `DeceptionGuard-OT-3D-Topology-${selectedCaseId}-${visualMode}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setSnapshotNotice(`Exported 3D PNG (${selectedCaseId} · ${visualMode})`);
    window.setTimeout(() => setSnapshotNotice(null), 3500);
  };

  const handleToggleFaultInjection = (deviceId: string) => {
    setFaultInjectedDevices((prev) =>
      prev.includes(deviceId) ? prev.filter((id) => id !== deviceId) : [...prev, deviceId]
    );
  };

  // Initialize Three.js WebGL Scene Once
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = Math.max(320, container.clientWidth || 960);
    const height = Math.max(420, container.clientHeight || 560);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.015);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 160);
    camera.position.set(18.5, 13.5, 20.5);
    camera.lookAt(0, 0.8, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Environment Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // 3-Point Warm/Cool Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.9);
    keyLight.position.set(14, 22, 16);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.camera.left = -18;
      keyLight.shadow.camera.right = 18;
      keyLight.shadow.camera.top = 18;
      keyLight.shadow.camera.bottom = -18;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x06b6d4, 0.95);
    rimLight.position.set(-16, 10, -14);
    scene.add(rimLight);

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 5;
    controls.maxDistance = 48;
    controls.maxPolarAngle = Math.PI / 1.95;
    controls.target.set(0, 0.8, 0);
    controls.addEventListener('start', () => {
      latestStateRef.current.cameraTransition = null;
    });

    // Plant Floor Slab, Grid & Physical Fluid Pipes (Mode A)
    const plantFloorGroup = new THREE.Group();
    const slabGeo = new THREE.BoxGeometry(26, 0.35, 16);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.15,
    });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.position.y = -0.18;
    slabMesh.receiveShadow = !isSoftwareGl;
    plantFloorGroup.add(slabMesh);

    const gridHelper = new THREE.GridHelper(26, 26, 0x1e293b, 0x1e293b);
    gridHelper.position.y = 0.01;
    plantFloorGroup.add(gridHelper);

    // 3D Fluid Pipeline connecting P-101 -> V-302 -> T-404 on the plant floor
    const fluidPipeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8.0, 0.78, 3.8),
      new THREE.Vector3(-4.5, 0.78, 4.1),
      new THREE.Vector3(-1.2, 0.78, 4.2),
      new THREE.Vector3(2.8, 0.78, 3.8),
      new THREE.Vector3(5.6, 0.78, 3.4),
    ]);
    const fluidPipeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(fluidPipeCurve, 36, 0.18, 12, false),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        metalness: 0.65,
        roughness: 0.25,
        emissive: 0x0369a1,
        emissiveIntensity: 0.35,
      })
    );
    plantFloorGroup.add(fluidPipeMesh);
    scene.add(plantFloorGroup);

    // Stratified Purdue Holographic Planes & Vertical Inter-Zone Conduits (Mode B)
    const purduePlanesGroup = new THREE.Group();
    for (const lvl of PURDUE_LEVEL_SPECS) {
      const planeGeo = new THREE.PlaneGeometry(21, 9.5);
      planeGeo.rotateX(-Math.PI / 2);
      const planeMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(lvl.colorHex),
        transparent: true,
        opacity: 0.11,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const planeMesh = new THREE.Mesh(planeGeo, planeMat);
      planeMesh.position.y = lvl.elevationY;
      purduePlanesGroup.add(planeMesh);

      const borderEdges = new THREE.EdgesGeometry(planeGeo);
      const borderLine = new THREE.LineSegments(
        borderEdges,
        new THREE.LineBasicMaterial({
          color: new THREE.Color(lvl.colorHex),
          transparent: true,
          opacity: 0.55,
        })
      );
      borderLine.position.y = lvl.elevationY;
      purduePlanesGroup.add(borderLine);

      const labelSprite = createHolographicLabelSprite(
        lvl.code,
        lvl.subnet,
        lvl.colorHex,
        '#090d16',
        maxAnisotropy
      );
      labelSprite.position.set(-8.2, lvl.elevationY + 0.55, -4.2);
      purduePlanesGroup.add(labelSprite);
    }

    // Vertical Inter-Zone Data Conduits linking L0 -> L1 -> L2 -> L3 -> L3.5
    for (const xPillar of [-5.5, 0, 5.5]) {
      const conduitGeo = new THREE.CylinderGeometry(0.06, 0.06, 13.6, 10);
      const conduitMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
      });
      const conduitPillar = new THREE.Mesh(conduitGeo, conduitMat);
      conduitPillar.position.set(xPillar, 1.6, 0);
      purduePlanesGroup.add(conduitPillar);
    }
    purduePlanesGroup.visible = false;
    scene.add(purduePlanesGroup);

    // Mode C: 3D Force-Directed Canary & Join-Token Satellite Nodes
    const forceGraphGroup = new THREE.Group();
    const canarySatellites = [
      {
        label: 'CANARY: TEST-SECRET-42',
        sub: 'Bound to C-201 Commissioning (TC-L01)',
        pos: new THREE.Vector3(-6.2, 6.2, -4.5),
        hostPos: new THREE.Vector3(-4.2, 4.2, -2.4),
      },
      {
        label: 'CANARY: OT-CANARY-991-AUTH',
        sub: 'Bound to GW-500 Diagnostics (TC-L05)',
        pos: new THREE.Vector3(3.8, 7.0, -5.0),
        hostPos: new THREE.Vector3(2.2, 5.0, -2.8),
      },
      {
        label: 'CANARY: HIST-MASTER-KEY-08',
        sub: 'Bound to HIST-601 Signing (TC-L09)',
        pos: new THREE.Vector3(10.2, 6.0, -4.4),
        hostPos: new THREE.Vector3(7.8, 4.0, -2.6),
      },
    ];
    for (const sat of canarySatellites) {
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.45, 0),
        new THREE.MeshStandardMaterial({
          color: 0xf43f5e,
          emissive: 0xe11d48,
          emissiveIntensity: 0.7,
          roughness: 0.25,
          metalness: 0.5,
        })
      );
      orb.position.copy(sat.pos);
      forceGraphGroup.add(orb);

      const link = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([sat.pos, sat.hostPos]),
        new THREE.LineBasicMaterial({ color: 0xf43f5e, transparent: true, opacity: 0.7 })
      );
      forceGraphGroup.add(link);

      const sp = createHolographicLabelSprite(
        sat.label,
        sat.sub,
        '#f43f5e',
        '#090d16',
        maxAnisotropy
      );
      sp.position.copy(sat.pos).add(new THREE.Vector3(0, 0.95, 0));
      sp.scale.set(4.2, 1.05, 1);
      forceGraphGroup.add(sp);
    }
    forceGraphGroup.visible = false;
    scene.add(forceGraphGroup);

    // 3D Subnet Containment Forcefield Dome (10.240.0.0/24)
    const domeGeo = new THREE.IcosahedronGeometry(15.2, 2);
    const domeEdges = new THREE.EdgesGeometry(domeGeo);
    const domeLineMat = new THREE.LineBasicMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.22,
    });
    const containmentDome = new THREE.LineSegments(domeEdges, domeLineMat);
    containmentDome.position.y = 1.0;
    scene.add(containmentDome);

    // Outbound Egress Vector Line & Pulse (TC-L10: 198.51.100.44:8443)
    const egressVectorGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(2.8, 1.5, -4.2),
      new THREE.Vector3(14.5, 6.2, -10.5),
    ]);
    const egressVectorMat = new THREE.LineBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.95,
    });
    const egressVectorLine = new THREE.Line(egressVectorGeo, egressVectorMat);
    egressVectorLine.visible = false;
    scene.add(egressVectorLine);

    const egressImpactRing = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 1.35, 24),
      new THREE.MeshBasicMaterial({
        color: 0xef4444,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      })
    );
    egressImpactRing.position.set(11.8, 5.1, -8.5);
    egressImpactRing.lookAt(2.8, 1.5, -4.2);
    egressImpactRing.visible = false;
    scene.add(egressImpactRing);

    // Build the 6 Composite OT Industrial Assets
    const assetMap = new Map<
      string,
      ReturnType<typeof buildCompositeIndustrialAsset> & { labelSprite: THREE.Sprite }
    >();
    const clickableProxies: THREE.Object3D[] = [];

    for (const node of latestStateRef.current.snapshot.nodes) {
      const built = buildCompositeIndustrialAsset(node.id, isSoftwareGl);
      built.root.position.set(node.activePos.x, node.activePos.y, node.activePos.z);

      const labelSprite = createHolographicLabelSprite(
        `${node.id} · ${node.deviceType}`,
        `${node.protocol} · ${node.purdueLevel}`,
        node.vulnerable ? '#ef4444' : '#10b981',
        '#0f172a',
        maxAnisotropy
      );
      labelSprite.position.set(0, 3.95, 0);
      built.root.add(labelSprite);

      scene.add(built.root);
      assetMap.set(node.id, { ...built, labelSprite });
      clickableProxies.push(built.hitProxy);
    }

    // Selection Ring Indicator on floor around active device
    const selectionRingGeo = new THREE.RingGeometry(1.95, 2.25, 32);
    selectionRingGeo.rotateX(-Math.PI / 2);
    const selectionRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const selectionRing = new THREE.Mesh(selectionRingGeo, selectionRingMat);
    selectionRing.position.y = 0.04;
    scene.add(selectionRing);

    // 3D Cross-Endpoint Inference Laser Arcs (TC-L02, TC-L04, TC-L06)
    const bridgeObjects = new Map<
      string,
      {
        line: THREE.Line;
        pulseOrb: THREE.Mesh;
        calloutSprite: THREE.Sprite;
        curve: THREE.QuadraticBezierCurve3;
      }
    >();

    for (const br of latestStateRef.current.snapshot.inferenceBridges) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-5, 1.5, 0),
        new THREE.Vector3(0, 6.2, 0),
        new THREE.Vector3(5, 1.5, 0)
      );
      const pts = curve.getPoints(32);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color: new THREE.Color(br.colorHex),
        transparent: true,
        opacity: 0.9,
      });
      const line = new THREE.Line(geo, mat);
      scene.add(line);

      const pulseOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 12, 12),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(br.colorHex) })
      );
      scene.add(pulseOrb);

      const calloutSprite = createHolographicLabelSprite(
        `${br.sourceDeviceId} <-> ${br.targetDeviceId} (${br.sequenceId})`,
        br.badgeText,
        br.colorHex,
        '#0f172a',
        maxAnisotropy
      );
      calloutSprite.scale.set(5.2, 1.25, 1);
      scene.add(calloutSprite);

      bridgeObjects.set(br.id, { line, pulseOrb, calloutSprite, curve });
    }

    // Active DVR Packet Energy Pulses along Conduits
    const packetConduitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 5, 5),
        new THREE.Vector3(0, 1, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.85 })
    );
    scene.add(packetConduitLine);

    const packetEnergyPulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    scene.add(packetEnergyPulse);

    // Raycasting for Clicking any 3D Asset
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 6) return; // Ignore drag-orbit gestures
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(clickableProxies, false);
      if (hits.length > 0 && hits[0].object.userData?.deviceId) {
        setSelectedDeviceId(String(hits[0].object.userData.deviceId));
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    // ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(300, entry.contentRect.width);
        const h = Math.max(380, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // Pre-compile shaders on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Frame-Paced Render Loop (Strict compliance with Three.js Skill Section 2.3)
    let frameId = 0;
    let isDisposed = false;
    const startTimeMs = performance.now();
    let prevTimeMs = startTimeMs;

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (isDisposed) return;
      const nowMs = performance.now();
      const dt = Math.min(0.1, Math.max(0.001, (nowMs - prevTimeMs) / 1000));
      prevTimeMs = nowMs;
      const elapsed = (nowMs - startTimeMs) / 1000;
      const { snapshot: snap, shaderMode: sMode, selectedDeviceId: selId, cameraTransition } =
        latestStateRef.current;

      // Toggle Floor vs Purdue Planes vs Force Graph
      plantFloorGroup.visible = snap.visualMode === 'plant_floor';
      purduePlanesGroup.visible = snap.visualMode === 'purdue_stack';
      forceGraphGroup.visible = snap.visualMode === 'force_graph';

      // Smooth Camera Bookmark Damping
      if (cameraTransition) {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, cameraTransition.pos.x, 5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, cameraTransition.pos.y, 5, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, cameraTransition.pos.z, 5, dt);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, cameraTransition.target.x, 5, dt);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, cameraTransition.target.y, 5, dt);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, cameraTransition.target.z, 5, dt);
        if (camera.position.distanceTo(cameraTransition.pos) < 0.15) {
          latestStateRef.current.cameraTransition = null;
        }
      }
      controls.update();

      // Animate 6 Industrial Device Nodes & Shaders
      for (const node of snap.nodes) {
        const asset = assetMap.get(node.id);
        if (!asset) continue;

        // Smoothly damp node position when switching Mode A / Mode B / Mode C
        asset.root.position.x = THREE.MathUtils.damp(asset.root.position.x, node.activePos.x, 6, dt);
        asset.root.position.y = THREE.MathUtils.damp(asset.root.position.y, node.activePos.y, 6, dt);
        asset.root.position.z = THREE.MathUtils.damp(asset.root.position.z, node.activePos.z, 6, dt);

        // Rotate P-101 impeller, V-302 handwheel, T-404 bridge
        if (asset.animatedRotor) {
          if (node.id === 'P-101') {
            asset.animatedRotor.rotation.z += dt * (node.registers.flowRateLpm > 0 ? 7.5 : 0.2);
          } else if (node.id === 'T-404') {
            asset.animatedRotor.rotation.y += dt * 0.45;
          } else {
            asset.animatedRotor.rotation.y += dt * 0.8;
          }
        }

        // Dynamic wave bobbing on T-404 Clarifier water surface
        if (asset.waterWaveMesh) {
          asset.waterWaveMesh.position.y = 1.66 + Math.sin(elapsed * 2.6) * 0.04;
        }

        // Cyber-Physical State Desync Wireframe Glitch Overlay (TC-L07 / TC-L08)
        asset.glitchWireframe.visible = node.hasStateDesyncAnomaly;
        if (node.hasStateDesyncAnomaly) {
          asset.glitchWireframe.rotation.y = Math.sin(elapsed * 14) * 0.06;
          asset.glitchWireframe.scale.setScalar(1.0 + Math.sin(elapsed * 10) * 0.03);
        }

        // Status Beacon color (Crimson when vulnerable, Emerald when hardened)
        const beaconMat = asset.statusBeacon.material as THREE.MeshStandardMaterial;
        const targetBeaconHex = node.vulnerable ? 0xef4444 : 0x10b981;
        beaconMat.color.setHex(targetBeaconHex);
        beaconMat.emissive.setHex(targetBeaconHex);
        asset.statusBeacon.rotation.y += dt * 1.6;

        // Thermal / Risk Heatmap Shaders on Primary Meshes
        for (const mesh of asset.primaryMeshes) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          mat.wireframe = sMode === 'xray_wireframe';

          if (sMode === 'blast_radius_glow') {
            const heatRatio = node.blastRadiusScore / 100;
            _tmpColor.setHSL((1 - heatRatio) * 0.33, 0.9, 0.45);
            mat.emissive.copy(_tmpColor);
            mat.emissiveIntensity = 0.55;
          } else if (sMode === 'traffic_density') {
            const densityRatio = node.trafficDensityScore / 100;
            _tmpColor.setHSL(0.55 - densityRatio * 0.48, 0.88, 0.46);
            mat.emissive.copy(_tmpColor);
            mat.emissiveIntensity = 0.5;
          } else if (sMode === 'xray_wireframe') {
            mat.emissive.setHex(node.vulnerable ? 0xef4444 : 0x06b6d4);
            mat.emissiveIntensity = 0.65;
          } else {
            mat.emissive.setHex(0x000000);
            mat.emissiveIntensity = 0;
          }
        }

        // Move selection ring to currently selected asset
        if (node.id === selId) {
          selectionRing.position.set(
            asset.root.position.x,
            asset.root.position.y + 0.04,
            asset.root.position.z
          );
        }
      }

      // Update 3D Cross-Endpoint Inference Laser Bridges
      for (const br of snap.inferenceBridges) {
        const obj = bridgeObjects.get(br.id);
        const srcAsset = assetMap.get(br.sourceDeviceId);
        const dstAsset = assetMap.get(br.targetDeviceId);
        if (!obj || !srcAsset || !dstAsset) continue;

        _tmpVecA.copy(srcAsset.root.position).add(new THREE.Vector3(0, 2.2, 0));
        _tmpVecB.copy(dstAsset.root.position).add(new THREE.Vector3(0, 2.2, 0));
        _tmpVecMid
          .copy(_tmpVecA)
          .add(_tmpVecB)
          .multiplyScalar(0.5)
          .add(new THREE.Vector3(0, br.activeInCurrentSequence ? 4.4 : 2.9, 0));

        obj.curve.v0.copy(_tmpVecA);
        obj.curve.v1.copy(_tmpVecMid);
        obj.curve.v2.copy(_tmpVecB);

        const pts = obj.curve.getPoints(32);
        obj.line.geometry.setFromPoints(pts);

        const lineMat = obj.line.material as THREE.LineBasicMaterial;
        lineMat.color.set(br.colorHex);
        lineMat.opacity = br.activeInCurrentSequence ? 1.0 : 0.48;

        const orbMat = obj.pulseOrb.material as THREE.MeshBasicMaterial;
        orbMat.color.set(br.colorHex);
        const t = (elapsed * (br.activeInCurrentSequence ? 0.85 : 0.35)) % 1;
        obj.curve.getPoint(t, obj.pulseOrb.position);
        obj.pulseOrb.scale.setScalar(br.activeInCurrentSequence ? 1.35 : 0.85);

        obj.calloutSprite.position.copy(_tmpVecMid).add(new THREE.Vector3(0, 0.65, 0));
        obj.calloutSprite.visible = br.activeInCurrentSequence || snap.visualMode === 'force_graph';
      }

      // Animate Active DVR Step Packet Ray
      const activeRay =
        snap.packetRays.find((r) => r.isCurrentDvrStep) ?? snap.packetRays[0];
      if (activeRay) {
        const dstAsset = assetMap.get(activeRay.targetId);
        const srcAsset = assetMap.get(activeRay.sourceId);
        const startPos = srcAsset
          ? _tmpVecA.copy(srcAsset.root.position).add(new THREE.Vector3(0, 2.1, 0))
          : _tmpVecA.set(0, 7.2, 9.2);
        const endPos = dstAsset
          ? _tmpVecB.copy(dstAsset.root.position).add(new THREE.Vector3(0, 2.1, 0))
          : _tmpVecB.set(0, 1.5, 0);

        packetConduitLine.geometry.setFromPoints([startPos, endPos]);
        (packetConduitLine.material as THREE.LineBasicMaterial).color.set(activeRay.colorHex);
        (packetEnergyPulse.material as THREE.MeshBasicMaterial).color.set(activeRay.colorHex);

        const rayT = (elapsed * activeRay.pulseSpeedMultiplier) % 1;
        packetEnergyPulse.position.lerpVectors(startPos, endPos, rayT);
      }

      // Update 3D Subnet Containment Forcefield Dome (10.240.0.0/24)
      domeLineMat.color.set(snap.containmentShield.domeColorHex);
      domeLineMat.opacity = snap.containmentShield.egressActiveInSequence ? 0.52 : 0.18;
      egressVectorLine.visible = snap.containmentShield.egressActiveInSequence;
      egressImpactRing.visible = snap.containmentShield.egressActiveInSequence;
      if (snap.containmentShield.egressActiveInSequence) {
        egressVectorMat.color.set(snap.containmentShield.vectorColorHex);
        (egressImpactRing.material as THREE.MeshBasicMaterial).color.set(
          snap.containmentShield.vectorColorHex
        );
        egressImpactRing.scale.setScalar(1.0 + Math.sin(elapsed * 8) * 0.22);
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  const activeRay =
    snapshot.packetRays.find((r) => r.isCurrentDvrStep) ?? snapshot.packetRays[0];

  return (
    <section
      aria-label="Multi-Layered 3D Purdue Model and Physical Water-Treatment Plant"
      className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden text-slate-100"
    >
      {/* Top 3D Control Header Bar */}
      <div className="p-4 sm:px-6 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
            <span className="text-sky-400 font-semibold">WEBGL 3D CYBER-PHYSICAL TWIN</span>
            <span aria-hidden="true">·</span>
            <span>Subnet Forcefield: {snapshot.containmentShield.subnetCidr}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                snapshot.containmentShield.verdict === 'BREACHED_UNMITIGATED'
                  ? 'text-red-400 font-semibold'
                  : 'text-emerald-400 font-semibold'
              }
            >
              Perimeter: {snapshot.containmentShield.verdict}
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white">
            Multi-Layered 3D Purdue Model, Physical Water-Treatment Plant & Packet Raytracer
          </h2>
        </div>

        {/* 3 Switchable Visual Modes + Snapshot Export */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="3D Visual Mode Switcher"
            className="inline-flex flex-wrap items-center bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1"
          >
            {(
              [
                { id: 'plant_floor' as const, label: 'Mode A: 3D Plant Floor' },
                { id: 'purdue_stack' as const, label: 'Mode B: 3D Purdue PERA' },
                { id: 'force_graph' as const, label: 'Mode C: 3D Attack Graph' },
              ]
            ).map((m) => {
              const active = visualMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeButton(m.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportSnapshotPng}
            className="px-3.5 py-2 text-xs font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Export 3D Topology Snapshot (PNG)
          </button>
        </div>
      </div>

      {/* Main 3D Viewport + Interactive Asset HUD Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Left 8 Cols: Dedicated WebGL Canvas Container + Collapsible Bottom Dock */}
        <div className="lg:col-span-8 relative min-h-[540px] bg-slate-950 flex flex-col justify-between overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-800">
          {/* Dedicated isolated WebGL canvas mount ref */}
          <div
            ref={canvasMountRef}
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          />

          {/* Minimal Top-Left Spec & Active DVR Payload Overlay */}
          <div className="relative z-10 p-4 pointer-events-none flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="bg-slate-900/95 border border-slate-800 rounded-md px-3.5 py-2.5 max-w-md pointer-events-auto">
              <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2">
                <span className="text-sky-400 font-semibold">{selectedCaseId}</span>
                <span>·</span>
                <span>
                  Step {snapshot.activeStepIndex + 1} of {snapshot.totalStepsInCase}
                </span>
                {activeRay && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums text-emerald-400">
                      {activeRay.protocol} ({activeRay.latencyMs} ms)
                    </span>
                  </>
                )}
              </div>
              {snapshot.activeStepRecord && (
                <div className="mt-1 text-xs font-mono text-slate-200 truncate">
                  {snapshot.activeStepRecord.method} {snapshot.activeStepRecord.endpoint} → HTTP{' '}
                  {snapshot.activeStepRecord.statusCode}
                </div>
              )}
              {activeRay?.leakedArtifactInStep && (
                <div className="mt-1 text-[11px] font-mono font-semibold text-red-400">
                  {activeRay.leakedArtifactInStep}
                </div>
              )}
            </div>

            {snapshotNotice && (
              <div
                role="status"
                className="bg-emerald-950 border border-emerald-700 text-emerald-200 px-3 py-1.5 rounded text-xs font-mono pointer-events-auto"
              >
                {snapshotNotice}
              </div>
            )}
          </div>

          {/* Unified Collapsible Bottom Control Dock (Zero Mid-Screen Occlusion) */}
          <div className="relative z-10 mt-auto p-3 flex flex-col items-center pointer-events-none">
            <button
              type="button"
              onClick={() => setIsBottomDockCollapsed((c) => !c)}
              className="pointer-events-auto mb-1.5 px-3 py-1 text-[11px] font-mono font-semibold text-slate-300 bg-slate-900 border border-slate-700 rounded-md hover:text-white cursor-pointer"
            >
              {isBottomDockCollapsed ? '[+] Show 3D DVR & Camera Dock' : '[-] Hide Controls (Cinema Mode)'}
            </button>

            {!isBottomDockCollapsed && (
              <div className="pointer-events-auto w-full max-w-[940px] bg-slate-900/95 border border-slate-800 rounded-lg p-3 space-y-2.5 shadow-xl">
                {/* Row 1: 3D Sequence DVR Time-Scrubber */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400 mr-1">3D DVR:</span>
                    <button
                      type="button"
                      onClick={() => setIsPlayingDvr((p) => !p)}
                      className="px-2.5 py-1 text-xs font-semibold bg-sky-500 text-slate-950 rounded cursor-pointer whitespace-nowrap"
                    >
                      {isPlayingDvr ? 'Pause' : 'Play'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayingDvr(false);
                        setActiveStepIndex((i) =>
                          (i - 1 + snapshot.totalStepsInCase) % snapshot.totalStepsInCase
                        );
                      }}
                      className="px-2 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer whitespace-nowrap"
                    >
                      Prev Step
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPlayingDvr(false);
                        setActiveStepIndex((i) => (i + 1) % snapshot.totalStepsInCase);
                      }}
                      className="px-2 py-1 text-xs font-mono bg-slate-800 hover:bg-slate-700 text-slate-200 rounded cursor-pointer whitespace-nowrap"
                    >
                      Next Step
                    </button>

                    {/* Speed Selector */}
                    <div className="inline-flex items-center gap-1 ml-1">
                      {[0.5, 1.0, 2.0].map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => setPlaybackSpeed(spd)}
                          className={`px-2 py-0.5 text-[11px] font-mono rounded cursor-pointer ${
                            playbackSpeed === spd
                              ? 'bg-slate-700 text-white font-semibold'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sequence Selector TC-L01 to TC-H10 */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="dvr-sequence-select" className="text-[11px] font-mono text-slate-400">
                      Sequence:
                    </label>
                    <select
                      id="dvr-sequence-select"
                      value={selectedCaseId}
                      onChange={(e) => onSelectCaseId(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-100"
                    >
                      {auditResult.records.map((rec) => (
                        <option key={rec.testCase.id} value={rec.testCase.id}>
                          {rec.testCase.id} — {rec.testCase.title.slice(0, 38)} ({rec.testCase.steps.length} steps)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Row 2: Camera Bookmarks & Thermal / Risk Shaders */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">Camera:</span>
                    {(
                      [
                        { id: 'isometric_plant' as const, label: 'Isometric Plant' },
                        { id: 'purdue_stack' as const, label: 'Purdue Stack' },
                        { id: 'top_down_blueprint' as const, label: 'Top-Down Blueprint' },
                        { id: 'first_person_device' as const, label: 'First-Person Fly-To' },
                      ]
                    ).map((bm) => (
                      <button
                        key={bm.id}
                        type="button"
                        onClick={() =>
                          triggerCameraPreset(
                            bm.id,
                            bm.id === 'first_person_device' ? selectedNode.activePos : undefined
                          )
                        }
                        className={`px-2.5 py-1 text-[11px] font-medium rounded whitespace-nowrap cursor-pointer ${
                          activeBookmark === bm.id
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {bm.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-slate-400">Shader:</span>
                    {(
                      [
                        { id: 'standard_pbr' as const, label: 'Studio PBR' },
                        { id: 'xray_wireframe' as const, label: 'X-Ray Wireframe' },
                        { id: 'blast_radius_glow' as const, label: 'Blast-Radius Glow' },
                        { id: 'traffic_density' as const, label: 'Traffic Density' },
                      ]
                    ).map((sh) => (
                      <button
                        key={sh.id}
                        type="button"
                        onClick={() => setShaderMode(sh.id)}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded whitespace-nowrap cursor-pointer ${
                          shaderMode === sh.id
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        {sh.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right 4 Cols: Interactive 3D HUD Inspector, Fault Injector & Live Mitigation Studio */}
        <div className="lg:col-span-4 bg-slate-900 p-5 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Quick 3D Asset Selector Strip */}
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
                Select 3D Industrial Asset (Click in 3D or Below)
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {snapshot.nodes.map((node) => {
                  const isSel = node.id === selectedNode.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeviceId(node.id);
                        triggerCameraPreset('first_person_device', node.activePos);
                      }}
                      className={`px-2.5 py-2 rounded border text-left transition-colors cursor-pointer ${
                        isSel
                          ? 'bg-slate-800 border-sky-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-mono font-bold">
                        <span>{node.id}</span>
                        <span
                          className={
                            node.vulnerable ? 'text-red-400 text-[10px]' : 'text-emerald-400 text-[10px]'
                          }
                        >
                          {node.vulnerable ? 'VULN' : 'SAFE'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{node.deviceType}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected 3D Node Telemetry & Blast Radius */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-sky-400">
                    {selectedNode.purdueLevel} · {selectedNode.protocol}
                  </div>
                  <h3 className="text-base font-bold text-white">{selectedNode.name}</h3>
                </div>
                <div className="text-right font-mono">
                  <div className="text-[10px] text-slate-400">BLAST RADIUS</div>
                  <div
                    className={`text-lg font-bold tabular-nums ${
                      selectedNode.vulnerable ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {selectedNode.blastRadiusScore} / 100
                  </div>
                </div>
              </div>

              {/* Cyber-Physical State Desync Callout */}
              {selectedNode.hasStateDesyncAnomaly && selectedNode.desyncDetail && (
                <div className="p-2.5 bg-red-950/80 border border-red-700 rounded text-xs font-mono text-red-200">
                  {selectedNode.desyncDetail}
                </div>
              )}

              {/* Live Industrial Registers Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">SCADA STATE</span>
                  <span className="text-white font-semibold">
                    {selectedNode.registers.reportedScadaState}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">FLOW / LEVEL</span>
                  <span className="text-white font-semibold tabular-nums">
                    {selectedNode.id === 'T-404'
                      ? `${selectedNode.registers.tankLevelPct}% Level`
                      : selectedNode.id === 'V-302'
                      ? `${selectedNode.registers.valvePositionPct}% Open`
                      : `${selectedNode.registers.flowRateLpm} L/min`}
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">ROTOR / TEMP</span>
                  <span className="text-white font-semibold tabular-nums">
                    {selectedNode.registers.rpm} RPM · {selectedNode.registers.temperatureC.toFixed(1)}°C
                  </span>
                </div>
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">JOIN HANDLE</span>
                  <span className="text-amber-300 font-semibold truncate block">
                    {selectedNode.joinTokenHandle}
                  </span>
                </div>
              </div>

              {/* Exposed Canary / Prohibited Fields */}
              <div className="text-xs font-mono space-y-1 pt-1 border-t border-slate-800">
                <div>
                  <span className="text-slate-400">Canary Exposure: </span>
                  <span
                    className={
                      selectedNode.exposedCanaryValue
                        ? 'text-red-400 font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {selectedNode.exposedCanaryValue ?? 'NONE (REDACTED)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Prohibited Fields: </span>
                  <span
                    className={
                      selectedNode.exposedProhibitedFields.length > 0
                        ? 'text-amber-400 font-semibold'
                        : 'text-emerald-400 font-semibold'
                    }
                  >
                    {selectedNode.exposedProhibitedFields.length > 0
                      ? selectedNode.exposedProhibitedFields.join(', ')
                      : 'STRIPPED (CLEAN)'}
                  </span>
                </div>
              </div>

              {/* Chaos / Fault Injector + Instant Node Healing */}
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleFaultInjection(selectedNode.id)}
                  className={`flex-1 px-3 py-2 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap ${
                    faultInjectedDevices.includes(selectedNode.id)
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {faultInjectedDevices.includes(selectedNode.id)
                    ? 'Clear Physical Fault'
                    : 'Simulate Physical Fault'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMitigationPolicy(selectedNode.recommendedMitigationKey)}
                  className="flex-1 px-3 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  {mitigationConfig[selectedNode.recommendedMitigationKey]
                    ? 'Disable Node Guard'
                    : 'Heal 3D Node (Mitigate)'}
                </button>
              </div>
            </div>

            {/* Active 3D Cross-Endpoint Inference Bridges Summary */}
            <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                  3D Cross-Endpoint Inference Lasers
                </span>
                <button
                  type="button"
                  onClick={
                    Object.values(mitigationConfig).every(Boolean)
                      ? onResetBaseline
                      : onApplyAllMitigations
                  }
                  className="text-[11px] font-mono text-sky-400 hover:underline cursor-pointer"
                >
                  {Object.values(mitigationConfig).every(Boolean)
                    ? 'Reset Unmitigated Baseline'
                    : 'Harden All 6 Policies'}
                </button>
              </div>
              <div className="space-y-1.5 text-xs font-mono">
                {snapshot.inferenceBridges.map((br) => (
                  <button
                    key={br.id}
                    type="button"
                    onClick={() => onSelectCaseId(br.sequenceId)}
                    className={`w-full text-left px-2.5 py-1.5 rounded border flex items-center justify-between gap-2 cursor-pointer ${
                      br.activeInCurrentSequence
                        ? 'bg-slate-900 border-amber-500/80 text-white'
                        : 'bg-slate-900/50 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate">
                      {br.sourceDeviceId} ↔ {br.targetDeviceId} ({br.joinToken})
                    </span>
                    <span
                      className={
                        br.leaked ? 'text-red-400 font-semibold shrink-0' : 'text-emerald-400 font-semibold shrink-0'
                      }
                    >
                      {br.leaked ? `Steps ${br.correlatedSteps[0]}↔${br.correlatedSteps[1]}` : 'UNLINKED'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Floating DVR JSON Payload Card */}
          {snapshot.activeStepRecord && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[11px] font-mono text-slate-400 mb-1 flex items-center justify-between">
                <span>LIVE DVR PAYLOAD (STEP {snapshot.activeStepRecord.stepNumber})</span>
                <span className="text-sky-400">{snapshot.activeStepRecord.endpoint}</span>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 overflow-x-auto max-h-24 leading-relaxed">
                {snapshot.activeStepRecord.payloadJson}
              </pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
