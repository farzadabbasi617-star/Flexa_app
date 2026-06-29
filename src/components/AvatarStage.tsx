"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin } from "@pixiv/three-vrm";

type AvatarEmotion = "neutral" | "happy" | "thinking" | "surprised" | "serious" | "sad";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  emotion?: AvatarEmotion;
};

type AvatarChatResponse = {
  response: string;
  emotion?: AvatarEmotion;
  gesture?: "idle" | "wave" | "nod" | "think";
  provider?: string;
  cachedProvider?: string | null;
};

const MODEL_URL = "/models/gament-assistant-human.vrm";

const QUICK_PROMPTS = [
  "سلام، خودت رو معرفی کن",
  "چطور در تورنومنت ثبت‌نام کنم؟",
  "قوانین مهم گیمنت چیه؟",
  "کدوم بازی‌ها پشتیبانی میشن؟",
];

const EMOTION_LABEL: Record<AvatarEmotion, string> = {
  neutral: "آماده",
  happy: "خوشحال",
  thinking: "در حال فکر",
  surprised: "متعجب",
  serious: "جدی",
  sad: "همدل",
};

function setExpression(vrm: VRM | null, name: string, value: number) {
  const manager = vrm?.expressionManager;
  if (!manager) return;
  try {
    manager.setValue(name, THREE.MathUtils.clamp(value, 0, 1));
  } catch {
    // Some VRM files do not include every preset expression. Ignore safely.
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
    setExpression(vrm, "aa", 0.22 * v);
  }
  if (emotion === "sad") setExpression(vrm, "sad", 0.72 * v);
  if (emotion === "serious") setExpression(vrm, "angry", 0.18 * v);
  if (emotion === "thinking") setExpression(vrm, "relaxed", 0.35 * v);
}

export default function AvatarStage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const mouthUntilRef = useRef(0);
  const currentEmotionRef = useRef<AvatarEmotion>("happy");
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [emotion, setEmotion] = useState<AvatarEmotion>("happy");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "سلام قهرمان! من گیم‌یار سه‌بعدی گیمنت هستم. درباره تورنومنت‌ها، قوانین، کیف پول و داوری ازم بپرس.",
      emotion: "happy",
    },
  ]);

  const statusText = useMemo(() => {
    if (modelStatus === "loading") return "در حال بارگذاری مدل سه‌بعدی...";
    if (modelStatus === "error") return "مدل سه‌بعدی لود نشد، اما چت فعال است.";
    return `حالت آواتار: ${EMOTION_LABEL[emotion]}`;
  }, [emotion, modelStatus]);

  useEffect(() => {
    let disposed = false;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.set(0, 1.25, 4.4);
    camera.lookAt(0, 1.0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;
    mount.appendChild(renderer.domElement);

    const key = new THREE.DirectionalLight(0xffffff, 2.25);
    key.position.set(1.4, 2.4, 2.8);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0x9b7cff, 1.15));

    const rim = new THREE.DirectionalLight(0xbc00ff, 1.4);
    rim.position.set(-2, 2.2, -1.2);
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
        const targetHeight = 2.35;
        const scale = initialSize.y > 0 ? targetHeight / initialSize.y : 1;
        modelRoot.scale.setScalar(scale);
        modelRoot.updateMatrixWorld(true);
        const fittedBox = new THREE.Box3().setFromObject(modelRoot);
        const center = fittedBox.getCenter(new THREE.Vector3());
        modelRoot.position.x -= center.x;
        modelRoot.position.y += 1.05 - center.y;
        modelRoot.position.z -= center.z;

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
        const head = vrm.humanoid?.getNormalizedBoneNode("head");
        const chest = vrm.humanoid?.getNormalizedBoneNode("chest");
        if (head) {
          head.rotation.y = Math.sin(elapsed * 0.85) * 0.045;
          head.rotation.x = Math.sin(elapsed * 0.62) * 0.025;
        }
        if (chest) chest.rotation.z = Math.sin(elapsed * 0.55) * 0.018;

        const blink = Math.sin(elapsed * 3.2) > 0.988 ? 1 : 0;
        setExpression(vrm, "blink", blink);

        if (Date.now() < mouthUntilRef.current) {
          const mouth = 0.08 + Math.abs(Math.sin(elapsed * 12)) * 0.46;
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
    setEmotion(nextEmotion);
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
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: data.response, emotion: nextEmotion },
      ]);
      setAvatarEmotion(nextEmotion, Math.min(7000, Math.max(1800, data.response.length * 55)));
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "گیم‌یار فعلاً در دسترس نیست.";
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: errorText, emotion: "sad" }]);
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
    <section className="min-h-[calc(100dvh-64px)] overflow-hidden bg-[#060610] text-white">
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute -top-24 right-[-18%] h-80 w-80 rounded-full bg-purple-700/30 blur-3xl" />
        <div className="absolute bottom-10 left-[-15%] h-96 w-96 rounded-full bg-cyan-500/18 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-5 px-4 py-6 pb-28 lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,.78fr)] lg:px-6 lg:py-10">
        <div className="relative min-h-[58dvh] overflow-hidden rounded-[34px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.025] shadow-[0_30px_100px_rgba(0,0,0,.55)] backdrop-blur-xl lg:min-h-[76dvh]">
          <div className="absolute inset-x-5 top-5 z-10 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.35em] text-purple-200/70" dir="ltr">GAMENT LIVE AI</p>
              <h1 className="mt-2 text-2xl font-black sm:text-4xl">گیم‌یار زنده</h1>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-3 py-2 text-[11px] font-black text-emerald-200">
              {modelStatus === "ready" ? "● آنلاین" : modelStatus === "loading" ? "در حال لود" : "چت فعال"}
            </div>
          </div>

          <div ref={mountRef} className="absolute inset-0 h-full w-full" aria-label="مدل سه‌بعدی گیم‌یار" />

          <div className="absolute inset-x-4 bottom-4 z-10 rounded-[26px] border border-white/10 bg-black/35 p-4 backdrop-blur-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black">{statusText}</div>
                <div className="mt-1 text-[11px] text-gray-400">با هر پیام، چهره و حرکت آواتار پویا تغییر می‌کند.</div>
              </div>
              <div className="flex gap-2 text-lg">
                {(["happy", "thinking", "surprised", "serious"] as AvatarEmotion[]).map((item) => (
                  <button
                    key={item}
                    onClick={() => setAvatarEmotion(item, item === "surprised" ? 900 : 0)}
                    className={`h-10 w-10 rounded-2xl border transition ${emotion === item ? "border-purple-300 bg-purple-500/25" : "border-white/10 bg-white/5"}`}
                    title={EMOTION_LABEL[item]}
                  >
                    {item === "happy" ? "😊" : item === "thinking" ? "🤔" : item === "surprised" ? "😮" : "😐"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex min-h-[58dvh] flex-col rounded-[34px] border border-white/10 bg-[#0b0b16]/88 shadow-[0_24px_80px_rgba(0,0,0,.45)] backdrop-blur-xl lg:min-h-[76dvh]">
          <div className="border-b border-white/10 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">چت با آواتار</h2>
                <p className="mt-1 text-xs leading-6 text-gray-400">سؤال بپرس؛ جواب AI همراه با احساسات به مدل منتقل می‌شود.</p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-purple-600 to-cyan-500 text-2xl shadow-[0_0_24px_rgba(188,0,255,.45)]">🤖</div>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[88%] rounded-3xl px-4 py-3 text-sm leading-7 whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "rounded-bl-lg bg-purple-600 text-white"
                    : "rounded-br-lg border border-white/10 bg-white/[0.07] text-gray-100"
                }`}>
                  {msg.text}
                  {msg.emotion && <div className="mt-2 text-[10px] text-purple-200/70">حالت: {EMOTION_LABEL[msg.emotion]}</div>}
                </div>
              </div>
            ))}
            {busy && <div className="text-right text-xs font-bold text-purple-300 animate-pulse">گیم‌یار در حال فکر کردن...</div>}
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => ask(prompt)}
                disabled={busy}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-gray-300 transition hover:border-purple-300/40 hover:text-white disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-4">
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
