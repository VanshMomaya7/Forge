import { useEffect, useRef, type CSSProperties } from "react";

// Self-contained, playable three.js game rendered in-app for the deployed build
// (where there is no backend to serve the preview). three is loaded from the
// esm.sh CDN at runtime so it never needs to be bundled or installed.
const THREE_URL = "https://esm.sh/three";

export default function RocketGame() {
  const mountRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const overRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let dispose = () => {};

    void (async () => {
      const url = THREE_URL;
      const THREE = (await import(/* @vite-ignore */ url)) as any;
      if (cancelled || !mountRef.current) return;
      const root = mountRef.current;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x05070f);
      scene.fog = new THREE.FogExp2(0x05070f, 0.018);

      const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
      camera.position.set(0, 0.6, 6);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";
      renderer.domElement.style.zIndex = "0";
      root.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0x6677aa, 0.7));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(3, 5, 4);
      scene.add(key);
      const rim = new THREE.PointLight(0x4f8cff, 1.1, 40);
      rim.position.set(-5, 3, 4);
      scene.add(rim);

      const starCount = 1500;
      const starGeo = new THREE.BufferGeometry();
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount; i++) {
        starPos[i * 3 + 0] = (Math.random() - 0.5) * 70;
        starPos[i * 3 + 1] = (Math.random() - 0.5) * 46;
        starPos[i * 3 + 2] = -Math.random() * 460;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
      const stars = new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.55, sizeAttenuation: true, transparent: true, opacity: 0.9 })
      );
      scene.add(stars);

      const rocket = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf3f5fb, metalness: 0.55, roughness: 0.3 });
      const accentMat = new THREE.MeshStandardMaterial({ color: 0xff5a5f, metalness: 0.4, roughness: 0.45 });
      rocket.add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 1.0, 28), bodyMat));
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 28), accentMat);
      nose.position.y = 0.78;
      rocket.add(nose);
      const win = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x22d3ee, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.1 })
      );
      win.position.set(0, 0.3, 0.2);
      rocket.add(win);
      const finGeo = new THREE.ConeGeometry(0.17, 0.42, 4);
      for (let f = 0; f < 3; f++) {
        const fin = new THREE.Mesh(finGeo, accentMat);
        const a = (f / 3) * Math.PI * 2;
        fin.position.set(Math.cos(a) * 0.27, -0.46, Math.sin(a) * 0.27);
        fin.rotation.x = Math.PI;
        fin.scale.set(0.7, 1, 0.35);
        rocket.add(fin);
      }
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.55, 18),
        new THREE.MeshBasicMaterial({ color: 0xffab33, transparent: true, opacity: 0.92 })
      );
      flame.position.y = -0.82;
      flame.rotation.x = Math.PI;
      rocket.add(flame);
      const flameLight = new THREE.PointLight(0xff8a3c, 1.4, 7);
      flameLight.position.y = -1.1;
      rocket.add(flameLight);
      rocket.position.set(0, 0, 2);
      scene.add(rocket);

      const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f9c, metalness: 0.1, roughness: 0.95, flatShading: true });
      const rocks: { mesh: any; r: number; sx: number; sy: number; sz: number }[] = [];
      const SPAWN_Z = -300;
      const resetRock = (rock: (typeof rocks)[number], initial: boolean) => {
        rock.mesh.position.set(
          (Math.random() - 0.5) * 8.4,
          (Math.random() - 0.5) * 5.2,
          initial ? -Math.random() * 300 : SPAWN_Z - Math.random() * 80
        );
      };
      for (let i = 0; i < 18; i++) {
        const r = 0.3 + Math.random() * 0.65;
        const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), rockMat);
        const rock = { mesh, r, sx: (Math.random() - 0.5) * 0.05, sy: (Math.random() - 0.5) * 0.05, sz: (Math.random() - 0.5) * 0.05 };
        resetRock(rock, true);
        scene.add(mesh);
        rocks.push(rock);
      }

      let vx = 0, vy = 0, speed = 0.6, score = 0, over = false;
      const keys: Record<string, boolean> = {};
      const setScore = () => {
        if (scoreRef.current) scoreRef.current.textContent = "SCORE  " + Math.floor(score);
      };
      const showOver = (show: boolean) => {
        if (overRef.current) overRef.current.style.display = show ? "flex" : "none";
      };
      const restart = () => {
        over = false; score = 0; speed = 0.6; vx = 0; vy = 0;
        rocket.position.set(0, 0, 2);
        for (const rk of rocks) resetRock(rk, true);
        showOver(false);
        setScore();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        keys[e.key.toLowerCase()] = true;
        if ((e.key === "r" || e.key === "R") && over) restart();
      };
      const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
      let pointerX = 0, pointerY = 0, usePointer = false;
      const onPointerMove = (e: PointerEvent) => {
        usePointer = true;
        const rect = renderer.domElement.getBoundingClientRect();
        pointerX = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
        pointerY = -(((e.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1);
      };
      const onClick = () => { if (over) restart(); };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("click", onClick);

      const resize = () => {
        const w = root.clientWidth || window.innerWidth;
        const h = root.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = "100%";
        renderer.domElement.style.height = "100%";
        camera.aspect = w / h || 1;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      const clock = new THREE.Clock();
      const tmp = new THREE.Vector3();
      let raf = 0;

      const loop = () => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);

        const sp = starGeo.attributes.position as any;
        for (let i = 0; i < starCount; i++) {
          let z = sp.getZ(i) + speed * 70 * dt;
          if (z > camera.position.z) z = -460;
          sp.setZ(i, z);
        }
        sp.needsUpdate = true;
        stars.rotation.z += 0.0008;

        if (!over) {
          speed = Math.min(2.4, speed + dt * 0.03);
          score += dt * 14 * (speed / 0.6);
          setScore();
          const right = keys["arrowright"] || keys["d"];
          const left = keys["arrowleft"] || keys["a"];
          const up = keys["arrowup"] || keys["w"];
          const down = keys["arrowdown"] || keys["s"];
          let ax = (right ? 1 : 0) - (left ? 1 : 0);
          let ay = (up ? 1 : 0) - (down ? 1 : 0);
          if (usePointer && ax === 0 && ay === 0) { ax = pointerX * 1.4; ay = pointerY * 1.4; }
          vx += ax * 20 * dt; vy += ay * 16 * dt;
          vx *= 0.86; vy *= 0.86;
          rocket.position.x = THREE.MathUtils.clamp(rocket.position.x + vx * dt, -3.5, 3.5);
          rocket.position.y = THREE.MathUtils.clamp(rocket.position.y + vy * dt, -2.3, 2.3);
        }

        rocket.rotation.z = THREE.MathUtils.clamp(-vx * 0.05, -0.55, 0.55);
        rocket.rotation.x = THREE.MathUtils.clamp(-vy * 0.04, -0.4, 0.4);
        flame.scale.y = 0.8 + Math.random() * 0.7;
        (flame.material as any).opacity = 0.7 + Math.random() * 0.3;
        flameLight.intensity = 1.2 + Math.random() * 0.7;

        for (const rk of rocks) {
          rk.mesh.position.z += speed * 70 * dt;
          rk.mesh.rotation.x += rk.sx;
          rk.mesh.rotation.y += rk.sy;
          rk.mesh.rotation.z += rk.sz;
          if (rk.mesh.position.z > camera.position.z + 3) resetRock(rk, false);
          if (!over) {
            tmp.subVectors(rk.mesh.position, rocket.position);
            if (Math.abs(tmp.z) < rk.r + 0.7 && Math.hypot(tmp.x, tmp.y) < rk.r + 0.45) {
              over = true;
              showOver(true);
            }
          }
        }

        camera.position.x += (rocket.position.x * 0.3 - camera.position.x) * 0.05;
        camera.lookAt(rocket.position.x * 0.18, rocket.position.y * 0.18 + 0.3, 0);
        renderer.render(scene, camera);
      };
      setScore();
      loop();

      dispose = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("resize", resize);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("click", onClick);
        renderer.dispose();
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      };
    })();

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const badge: CSSProperties = {
    position: "absolute", top: "18px", left: "20px", zIndex: 2, pointerEvents: "none",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "15px",
    letterSpacing: "0.18em", color: "#dbe6ff", textShadow: "0 1px 12px rgba(40,90,200,0.6)",
  };
  const hint: CSSProperties = {
    position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 2,
    pointerEvents: "none", fontFamily: "ui-sans-serif, system-ui, sans-serif", fontSize: "13px",
    color: "rgba(210,220,245,0.7)", background: "rgba(10,14,30,0.45)", border: "1px solid rgba(255,255,255,0.1)",
    padding: "8px 14px", borderRadius: "999px",
  };
  const overlay: CSSProperties = {
    position: "absolute", inset: 0, zIndex: 3, display: "none", pointerEvents: "none",
    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px",
    fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#fff",
    background: "radial-gradient(circle at 50% 45%, rgba(10,14,30,0.35), rgba(5,7,15,0.78))",
  };

  return (
    <div ref={mountRef} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#05070f" }}>
      <div ref={scoreRef} style={badge}>SCORE  0</div>
      <div style={hint}>Arrow keys / WASD (or mouse) to fly — dodge the asteroids</div>
      <div ref={overRef} style={overlay}>
        <div style={{ fontSize: "44px", fontWeight: 700, letterSpacing: "0.04em" }}>GAME OVER</div>
        <div style={{ fontSize: "15px", color: "rgba(220,228,250,0.85)" }}>press R or click to fly again</div>
      </div>
    </div>
  );
}
