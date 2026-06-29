"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin } from "@pixiv/three-vrm";

type AvatarEmotion = "neutral" | "happy" | "thinking" | "surprised" | "serious" | "sad";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type AvatarChatResponse = {
  response: string;
  emotion?: AvatarEmotion;
  gesture?: "idle" | "wave" | "nod" | "think";
};

const MODEL_URL = "/models/gament-assistant-human.vrm";

function setExpression(vrm: VRM | null, name: string, value: number) {
  const manager = vrm?.expressionManager;
  if (!manager) return;
  try {
    manager.setValue(name, THREE.MathUtils.clamp(value, 0, 1));
  } catch {
    // The downloaded model may not include every preset expression.
  }
}

function resetExpressions(vrm: VRM | null) {
  for (const name of ["happy", "angry", "sad", "relaxed", "surprised", "aa", "ih", "ou", "ee", "oh"]) {
    setExpression(vrm, name, 0);
  }
}

function applyEmotion(vrm: VRM | null, emotion: AvatarEmotion, intensity = 1) {
  resetExpressions(vrm);
  const v = THREE.MathUtils.clamp(intensity, 0, 1);

  if (emotion === "happy") setExpression(vrm, "happy", 0.85 * v);
  if (emotion === "surprised") {
    setExpression(vrm, "surprised", 0.9 * v);
    setExpression(vrm, "aa", 0.2 * v);
  }
  if (emotion === "sad") setExpression(vrm, "sad", 0.72 * v);
  if (emotion === "serious") setExpression(vrm, "angry", 0.18 * v);
  if (emotion === "thinking") setExpression(vrm, "relaxed", 0.35 * v);
}

function setBoneRotation(vrm: VRM | null, boneName: string, x: number, y: number, z: number) {
  const bone = vrm?.humanoid?.getNormalizedBoneNode(boneName as never);
  if (!bone) return;
  bone.rotation.set(x, y, z);
}

function applyRelaxedPose(vrm: VRM | null, elapsed = 0) {
  const breathe = Math.sin(elapsed * 0.8) * 0.018;

  // The model opens in a T/A-pose by default. These rotations put the arms down
  // into a neutral assistant stance and keep it stable while expressions change.
  setBoneRotation(vrm, "leftUpperArm", 0.08, 0.0, -1.18 + breathe);
  setBoneRotation(vrm, "rightUpperArm", 0.08, 0.0, 1.18 - breathe);
  setBoneRotation(vrm, "leftLowerArm", 0.04, 0.0, -0.18);
  setBoneRotation(vrm, "rightLowerArm", 0.04, 0.0, 0.18);
  setBoneRotation(vrm, "leftHand", 0.0, 0.0, -0.08);
  setBoneRotation(vrm, "rightHand", 0.0, 0.0, 0.08);

  const spine = vrm?.humanoid?.getNormalizedBoneNode("spine" as never);
  if (spine) spine.rotation.x = breathe * 0.45;
}

export default function AvatarStage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mouthUntilRef = useRef(0);
  const currentEmotionRef = useRef<AvatarEmotion>("happy");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "سلام قهرمان! من گیم‌یار سه‌بعدی گیمنت هستم. هر سوالی درباره تورنومنت، کیف پول، قوانین و داوری داری بپرس.",
    },
  ]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
    camera.position.set(0, 1.18, 6.2);
    camera.lookAt(0, 0.98, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const key = new THREE.DirectionalLight(0xffffff, 2.35);
    key.position.set(1.6, 2.6, 3.2);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0x9b7cff, 1.25));

    const rim = new THREE.DirectionalLight(0xbc00ff, 1.55);
    rim.position.set(-2.2, 2.4, -1.4);
    scene.add(rim);

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) throw new Error("VRM not found in model file");

        vrmRef.current = vrm;
        const modelRoot = vrm.scene;
        modelRoot.rotation.set(0, 0, 0);
        modelRoot.position.set(0, 0, 0);
        modelRoot.scale.setScalar(1);
        modelRoot.traverse((object) => {
          if ((object as THREE.Mesh).isMesh) {
            const mesh = object as THREE.Mesh;
            mesh.frustumCulled = false;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              if (material) material.side = THREE.DoubleSide;
            }
          }
        });

        modelRoot.updateMatrixWorld(true);
        const initialBox = new THREE.Box3().setFromObject(modelRoot);
        const initialSize = initialBox.getSize(new THREE.Vector3());
        const targetHeight = 1.82;
        const scale = initialSize.y > 0 ? targetHeight / initialSize.y : 1;
        modelRoot.scale.setScalar(scale);
        modelRoot.updateMatrixWorld(true);
        const fittedBox = new THREE.Box3().setFromObject(modelRoot);
        const center = fittedBox.getCenter(new THREE.Vector3());
        modelRoot.position.x -= center.x;
        modelRoot.position.y += 0.92 - center.y;
        modelRoot.position.z -= center.z;

        applyRelaxedPose(vrm, 0);
        scene.add(modelRoot);
        applyEmotion(vrm, currentEmotionRef.current, 1);
        setModelStatus("ready");
      })
      .catch(() => {
        if (!disposed) setModelStatus("error");
      });

    const clock = new THREE.Clock();
    let frame = 0;

    const resize = () => {
      const width = mount.clientWidth || 320;
      const height = mount.clientHeight || 520;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const animate = () => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.elapsedTime;
      const vrm = vrmRef.current;

      if (vrm) {
        applyRelaxedPose(vrm, elapsed);

        const head = vrm.humanoid?.getNormalizedBoneNode("head" as never);
        const chest = vrm.humanoid?.getNormalizedBoneNode("chest" as never);
        if (head) {
          head.rotation.y = Math.sin(elapsed * 0.72) * 0.035;
          head.rotation.x = Math.sin(elapsed * 0.55) * 0.02;
        }
        if (chest) chest.rotation.z = Math.sin(elapsed * 0.5) * 0.012;

        const blink = Math.sin(elapsed * 3.1) > 0.989 ? 1 : 0;
        setExpression(vrm, "blink", blink);

        if (Date.now() < mouthUntilRef.current) {
          const mouth = 0.07 + Math.abs(Math.sin(elapsed * 12)) * 0.42;
          setExpression(vrm, "aa", mouth);
        } else if (currentEmotionRef.current !== "surprised") {
          setExpression(vrm, "aa", 0);
        }

        vrm.update(delta);
      }

      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener("resize", resize);
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      vrmRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const setAvatarEmotion = useCallback((nextEmotion: AvatarEmotion, speakingMs = 0) => {
    currentEmotionRef.current = nextEmotion;
    applyEmotion(vrmRef.current, nextEmotion, 1);
    if (speakingMs > 0) mouthUntilRef.current = Date.now() + speakingMs;
  }, []);

  async function ask(message: string) {
    const text = message.trim();
    if (!text || busy) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setBusy(true);
    setAvatarEmotion("thinking");

    try {
      const res = await fetch("/api/ai/avatar-chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await res.json()) as AvatarChatResponse & { error?: string };
      if (!res.ok) throw new Error(data.error || "پاسخ دریافت نشد");

      const nextEmotion = data.emotion || "happy";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: data.response }]);
      setAvatarEmotion(nextEmotion, Math.min(7000, Math.max(1800, data.response.length * 55)));
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "گیم‌یار فعلاً در دسترس نیست.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: errorText }]);
      setAvatarEmotion("sad", 1800);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <section className="relative min-h-[calc(100dvh-64px)] overflow-hidden bg-[#05050d] text-white">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -top-28 right-[-22%] h-96 w-96 rounded-full bg-purple-700/28 blur-3xl" />
        <div className="absolute bottom-0 left-[-20%] h-[28rem] w-[28rem] rounded-full bg-cyan-500/14 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] max-w-7xl gap-3 px-3 py-3 pb-24 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-5 lg:px-6 lg:py-6">
        <div className="relative min-h-[45dvh] overflow-hidden rounded-[30px] border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.018] shadow-[0_24px_80px_rgba(0,0,0,.52)] lg:min-h-[calc(100dvh-112px)]">
          <div ref={mountRef} className="absolute inset-0 h-full w-full" aria-label="مدل سه‌بعدی گیم‌یار" />
          {modelStatus !== "ready" && (
            <div className="absolute inset-x-4 top-4 z-10 rounded-2xl border border-white/10 bg-black/28 px-4 py-3 text-xs font-black text-purple-100 backdrop-blur-xl">
              {modelStatus === "loading" ? "در حال لود مدل..." : "چت فعال است؛ مدل لود نشد."}
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,transparent,rgba(5,5,13,.2)_58%,rgba(5,5,13,.78))]" />
        </div>

        <aside className="flex min-h-[42dvh] flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#080812]/82 shadow-[0_24px_80px_rgba(0,0,0,.42)] backdrop-blur-xl lg:min-h-[calc(100dvh-112px)]">
          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "rounded-bl-lg bg-purple-600 text-white shadow-lg shadow-purple-900/20"
                      : "rounded-br-lg border border-white/10 bg-white/[0.07] text-gray-100"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {busy && <div className="text-right text-xs font-bold text-purple-300 animate-pulse">در حال فکر کردن...</div>}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-white/10 bg-black/18 p-3 sm:p-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition placeholder:text-gray-600 focus:border-purple-300"
              placeholder="پیامت را بنویس..."
              maxLength={1000}
            />
            <button disabled={busy || !input.trim()} className="rounded-2xl bg-purple-600 px-5 text-sm font-black text-white shadow-lg shadow-purple-700/30 transition active:scale-95 disabled:opacity-40">
              ارسال
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}
