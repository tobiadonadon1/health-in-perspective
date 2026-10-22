import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Licensed anatomical art, never a representation inferred from health measurements. */
export function mountAvatar(container, options = {}) {
  if (!container?.appendChild) throw new TypeError('mountAvatar requires a DOM container');
  const configuration = { skinColor: '#b9c6a8', height: 178, weight: 76, ...options };
  let disposed = false, renderer, controls, observer, frame = 0, model = null;
  let contextLost = false;
  const geometries = new Set(), materials = new Set();
  const host = document.createElement('div');
  host.style.cssText = 'position:relative;width:100%;height:100%;min-height:280px;overflow:hidden;border-radius:inherit;background:transparent';
  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:absolute;inset:0;touch-action:none';
  const caption = document.createElement('div');
  caption.style.cssText = 'position:absolute;left:10px;right:10px;bottom:11px;text-align:center;color:#7b8870;font:9px/1.65 system-ui,sans-serif;letter-spacing:.02em;pointer-events:none';
  caption.innerHTML = '<span style="display:inline-block;padding:6px 12px;border:1px solid #ffffffb5;border-radius:18px;background:#f6f9edb3;backdrop-filter:blur(8px);font-size:10px">Drag to rotate · Scroll to zoom</span><br><span>Illustrative model · Not a personal scan</span><br><a href="/models/ATTRIBUTION.txt" target="_blank" rel="noopener" style="color:inherit;font-size:8px;text-decoration:none;pointer-events:auto;opacity:.75">3D artwork: Lee Perry-Smith · CC BY 3.0</a>';
  const loading = document.createElement('div');
  loading.style.cssText = 'position:absolute;inset:0;display:grid;place-items:center;color:#8b987e;font:11px system-ui,sans-serif';
  loading.textContent = 'Preparing your 3D view…';
  host.append(viewport, loading, caption);
  container.appendChild(host);

  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
  const figure = new THREE.Group();
  figure.rotation.y = -0.72;
  scene.add(figure);
  const clay = new THREE.MeshPhysicalMaterial({ color: '#b9c6a8', roughness: 0.77, metalness: 0, clearcoat: 0.035, clearcoatRoughness: 0.85 });
  materials.add(clay);

  function fallback(message = 'Your browser could not start the 3D view.') {
    loading.remove();
    viewport.innerHTML = `<div role="img" aria-label="3D view unavailable" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#7d8e72;font:12px/1.7 system-ui,sans-serif;padding:36px;text-align:center"><svg width="86" height="100" viewBox="0 0 86 100" aria-hidden="true" style="margin-bottom:16px;opacity:.6"><path d="M43 9c-14 0-20 11-20 25 0 11 4 20 10 24v10c-15 4-25 12-27 25h74c-2-13-12-21-27-25V58c6-4 10-13 10-24C63 20 57 9 43 9Z" fill="#b9c9aa"/></svg><strong style="font-weight:500">3D view unavailable</strong><span style="max-width:220px;margin-top:4px">${message} Your measurements remain available.</span></div>`;
    caption.innerHTML = 'Illustrative model · Not a personal scan';
  }

  function fitCamera() {
    if (!renderer || !controls || disposed) return;
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    if (!model) return;
    const bounds = new THREE.Box3().setFromObject(figure);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const vertical = Math.max(size.y * 1.06, size.x / camera.aspect * 0.86);
    const distance = vertical / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) + size.z * 0.10;
    const direction = camera.position.clone().sub(controls.target).normalize();
    if (!Number.isFinite(direction.x) || direction.lengthSq() < 0.1) direction.set(0, 0.02, 1);
    // Caption occupies a slim lower band; offset the view a little toward the base.
    center.y -= size.y * 0.045;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.minDistance = distance * 0.55;
    controls.maxDistance = distance * 1.7;
    controls.update();
  }

  function setAppearance(next = {}) {
    Object.assign(configuration, next);
    if (typeof configuration.skinColor === 'string' && /^(#[\da-f]{3}|#[\da-f]{6})$/i.test(configuration.skinColor)) clay.color.set(configuration.skinColor);
    if (!model) return;
    // This licensed bust is deliberately not morphed from height/weight. Those
    // values remain factual measurements elsewhere, not an invented scan.
    fitCamera();
  }

  function releaseLoaded(root) {
    root.traverse(object => {
      if (!object.isMesh) return;
      object.geometry?.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
    });
  }

  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    fallback('The browser paused 3D rendering. Refresh to try again.');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener('resize', fitCamera);
    controls?.dispose();
    if (renderer) {
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
    }
    geometries.forEach(g => g.dispose());
    materials.forEach(m => m.dispose());
    host.remove();
  }

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;outline:none';
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', 'Illustrative sculpted human bust. Drag for a full 360-degree view and scroll to zoom. This is licensed artwork, not a personal medical scan.');
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    viewport.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    camera.position.set(0.05, 0.15, 5);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.72;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.65;
    controls.update();
    scene.add(new THREE.HemisphereLight(0xf8fbed, 0x77896b, 2.2));
    const key = new THREE.DirectionalLight(0xfff7e5, 3.6);
    key.position.set(-3, 5, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf1ffe3, 3.1);
    rim.position.set(3, 2.5, -3);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xdce8d0, 0.55);
    fill.position.set(4, 1, 3);
    scene.add(fill);

    new GLTFLoader().load('/models/LeePerrySmith.glb', gltf => {
      if (disposed || contextLost) { releaseLoaded(gltf.scene); return; }
      model = gltf.scene;
      // Use the scan's continuous geometry and authored smooth normals. Drop
      // source materials and photographic appearance for a neutral clay study.
      model.traverse(object => {
        if (!object.isMesh) return;
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material?.dispose();
        object.material = clay;
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 2.1 / size.y;
      model.position.copy(center).multiplyScalar(-scale);
      model.scale.setScalar(scale);
      figure.add(model);
      setAppearance(configuration);
      loading.remove();
    }, undefined, () => {
      if (!disposed) fallback('The model could not load. Refresh to try again.');
    });
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fitCamera);
      observer.observe(host);
    } else window.addEventListener('resize', fitCamera);
    fitCamera();
    function animate() {
      if (disposed || contextLost) return;
      frame = requestAnimationFrame(animate);
      controls.update();
      if (host.clientWidth && host.clientHeight) renderer.render(scene, camera);
    }
    animate();
  } catch (error) {
    cancelAnimationFrame(frame);
    controls?.dispose();
    observer?.disconnect();
    renderer?.dispose();
    fallback();
    console.warn('Illustrative avatar could not initialize:', error?.message || error);
  }
  return { dispose, setAppearance };
}
