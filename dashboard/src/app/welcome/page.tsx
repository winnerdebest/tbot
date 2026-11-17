"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  Clock,
  Coffee,
  Cpu,
  Edit3,
  FileEdit,
  KeyRound,
  Layers,
  Lock,
  MessageCircle,
  Moon,
  PauseCircle,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Briefcase,
  Zap,
} from "lucide-react";
import AniLogo from "@/components/AniLogo";
import styles from "./welcome.module.css";

type PersonaId = "casual" | "founder" | "executive";
type ReplyMode = "auto" | "draft" | "sleep";

interface PlayMsg {
  id: string;
  role: "in" | "out" | "owner";
  text: string;
  tag?: string;
  isDraft?: boolean;
  streaming?: boolean;
}

const ROTATING_WORDS = [
  "in your exact voice.",
  "while you sleep.",
  "while you focus.",
  "without missing a beat.",
];

const PERSONAS: Record<
  PersonaId,
  {
    name: string;
    hint: string;
    memoryFact: string;
    replies: {
      coffee: string;
      weekend: string;
      custom: (input: string) => string;
    };
  }
> = {
  casual: {
    name: "Casual",
    hint: "Warm, lowercase texting, natural pacing, remembers personal details.",
    memoryFact: "Maya · Designer in Berlin · Loves oat flat whites · App launch Tuesday",
    replies: {
      coffee:
        "thursday afternoon works great for me! good luck with the tuesday app launch btw, let's grab that oat flat white around 3pm?",
      weekend:
        "honestly keeping it super chill! might check out that new photo exhibit downtown on saturday, what about you?",
      custom: (q) =>
        `haha love that — just saw "${q.slice(0, 42)}${q.length > 42 ? "..." : ""}". i'm wrapping up a quick thing right now, let's catch up properly in a bit!`,
    },
  },
  founder: {
    name: "Founder",
    hint: "Direct, high-agency triage, protects your calendar, asks for context first.",
    memoryFact: "Maya · Lead Product Designer · Shipping v2 mobile release Tuesday",
    replies: {
      coffee:
        "Thursday at 3pm works — let's keep it to 30 mins right after your Tuesday launch wraps. Shoot me any notes beforehand!",
      weekend:
        "Heads down shipping this weekend, but drop me a quick voice note or async update and I'll review tonight.",
      custom: (q) =>
        `Got your note on "${q.slice(0, 36)}${q.length > 36 ? "..." : ""}" — in back-to-back sessions right now, send over the key details and I'll jump on it shortly.`,
    },
  },
  executive: {
    name: "Executive",
    hint: "Polished, structured, zero slang, clear next steps and scheduling.",
    memoryFact: "Maya Lin · Senior Designer (CET) · Q4 Mobile Launch Lead",
    replies: {
      coffee:
        "Thursday afternoon at 3:00 PM works well on my end. Wishing you a smooth product launch on Tuesday—looking forward to catching up then.",
      weekend:
        "I have a quiet weekend planned and will be offline most of Saturday. Please let me know if anything requires attention before Friday evening.",
      custom: (q) =>
        `Thank you for reaching out regarding "${q.slice(0, 36)}${q.length > 36 ? "..." : ""}". I am currently away from my desk and will follow up with you shortly.`,
    },
  },
};

const PIPELINE_STEPS = [
  "1. Incoming",
  "2. Schedule & Rules",
  "3. Memory Injected",
  "4. Groq Llama 3.3",
  "5. Delivered",
];

const MEMORY_FACTS = [
  "Lives in Berlin (CET)",
  "Product Designer @ Figma",
  "Oat flat white order",
  "Launching mobile app Tuesday",
  "Prefers afternoon meetings",
  "Sister's wedding in June",
];

export default function WelcomeLandingPage() {
  // ── 1. Rotating Headline Word ──
  const [wordIdx, setWordIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setWordIdx((i) => (i + 1) % ROTATING_WORDS.length);
    }, 2900);
    return () => clearInterval(id);
  }, []);

  // ── 2. Scroll Reveal Observer ──
  const rootRef = useRef<HTMLDivElement>(null);
  const [stepsLineOn, setStepsLineOn] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealed);
            if (entry.target.getAttribute("data-steps") === "true") {
              setStepsLineOn(true);
            }
          }
        });
      },
      { root, threshold: 0.14 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // ── 3. Hero 3D Phone Tilt & Looping Story ──
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [heroStage, setHeroStage] = useState<0 | 1 | 2 | 3>(2);

  useEffect(() => {
    const timer = setInterval(() => {
      setHeroStage((prev) => ((prev + 1) % 4) as 0 | 1 | 2 | 3);
    }, 3400);
    return () => clearInterval(timer);
  }, []);

  const handlePhoneMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ rx: -y * 12, ry: x * 14 });
  };

  // ── 4. Interactive Pipeline Playground State ──
  const [persona, setPersona] = useState<PersonaId>("casual");
  const [mode, setMode] = useState<ReplyMode>("auto");
  const [activeStage, setActiveStage] = useState<number>(4);
  const [warnStage, setWarnStage] = useState<number | null>(null);
  const [customText, setCustomText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [playMessages, setPlayMessages] = useState<PlayMsg[]>([
    {
      id: "init-1",
      role: "in",
      text: "Hey! Super swamped with the Tuesday launch — any chance we can move our coffee catch-up to Thursday afternoon?",
    },
    {
      id: "init-2",
      role: "out",
      text: PERSONAS.casual.replies.coffee,
      tag: "Groq Llama 3.3 70B · 180ms · Memory used",
    },
  ]);
  const playChatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playChatRef.current) {
      playChatRef.current.scrollTop = playChatRef.current.scrollHeight;
    }
  }, [playMessages, isStreaming]);

  const runSimulation = (
    scenario: "coffee" | "weekend" | "urgent" | "owner" | "custom",
    userPrompt?: string
  ) => {
    if (isStreaming) return;

    if (scenario === "owner") {
      setWarnStage(1);
      setActiveStage(1);
      setPlayMessages((prev) => [
        ...prev,
        {
          id: `own-${Date.now()}`,
          role: "owner",
          text: "Hey Maya! Jumping in from my phone — let's do 4pm Thursday instead!",
          tag: "Sent by You · AI auto-paused for 30m",
        },
      ]);
      return;
    }

    const incomingText =
      scenario === "coffee"
        ? "Hey! Super swamped with the Tuesday launch — any chance we can move our coffee catch-up to Thursday afternoon?"
        : scenario === "weekend"
        ? "What are your plans for this weekend btw?"
        : scenario === "urgent"
        ? "Hey this is urgent, please call me as soon as you see this!"
        : userPrompt || "Hey! Are you free for a quick chat later?";

    setWarnStage(null);
    setActiveStage(0);
    setIsStreaming(true);

    setPlayMessages((prev) => [
      ...prev,
      { id: `in-${Date.now()}`, role: "in", text: incomingText },
    ]);

    setTimeout(() => setActiveStage(1), 220);

    // Urgent handoff keyword stops at stage 1
    if (scenario === "urgent") {
      setTimeout(() => {
        setWarnStage(1);
        setIsStreaming(false);
        setPlayMessages((prev) => [
          ...prev,
          {
            id: `warn-${Date.now()}`,
            role: "owner",
            text: "Handoff keyword 'urgent' detected — AI paused automatically so you can handle this personally.",
            tag: "Safety Handoff Rule Triggered",
          },
        ]);
      }, 650);
      return;
    }

    setTimeout(() => setActiveStage(2), 460);
    setTimeout(() => setActiveStage(3), 720);

    const targetReply =
      mode === "sleep"
        ? "hey! heading to bed now, super tired — i'll catch up with you in the morning!"
        : scenario === "coffee"
        ? PERSONAS[persona].replies.coffee
        : scenario === "weekend"
        ? PERSONAS[persona].replies.weekend
        : PERSONAS[persona].replies.custom(incomingText);

    const replyTag =
      mode === "sleep"
        ? "Sleep Schedule Active · Follow-up queued for 7:00 AM"
        : mode === "draft"
        ? "Draft Ready · Waiting for your 1-click approval"
        : `Groq Llama 3.3 70B · ${PERSONAS[persona].name} Persona`;

    const outId = `out-${Date.now()}`;

    setTimeout(() => {
      setActiveStage(4);
      setPlayMessages((prev) => [
        ...prev,
        {
          id: outId,
          role: "out",
          text: "",
          tag: replyTag,
          isDraft: mode === "draft",
          streaming: true,
        },
      ]);

      let idx = 0;
      const interval = setInterval(() => {
        idx += 4;
        const slice = targetReply.slice(0, idx);
        setPlayMessages((prev) =>
          prev.map((m) =>
            m.id === outId
              ? {
                  ...m,
                  text: slice,
                  streaming: idx < targetReply.length,
                }
              : m
          )
        );
        if (idx >= targetReply.length) {
          clearInterval(interval);
          setIsStreaming(false);
        }
      }, 18);
    }, 950);
  };

  const approveDraftInPlay = (id: string) => {
    setPlayMessages((prev) =>
      prev.map((m) =>
        m.id === id
          ? {
              ...m,
              isDraft: false,
              tag: "Approved by you & delivered to Telegram",
            }
          : m
      )
    );
  };

  // ── 5. Bento Card Interactive States ──
  const [activeFact, setActiveFact] = useState(0);
  const [hourOfDay, setHourOfDay] = useState(14);
  const [autoPauseOn, setAutoPauseOn] = useState(true);
  const [pauseRemaining, setPauseRemaining] = useState(28);
  const [draftApproved, setDraftApproved] = useState(false);
  const [draftShort, setDraftShort] = useState(false);
  const [sampleKey, setSampleKey] = useState("gsk_live_98f2a7c4e1b09d3a");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActiveFact((f) => (f + 1) % MEMORY_FACTS.length);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const handleCardMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--y", `${e.clientY - rect.top}px`);
  };

  // Derive schedule status from hourOfDay (0..23)
  const scheduleMode =
    hourOfDay >= 23 || hourOfDay < 7
      ? {
          label: "Sleep Hours (23:00–07:00)",
          desc: "Sends a polite heads-up once and queues messages until 7:00 AM.",
          color: "var(--l-violet)",
          bg: "rgba(167, 139, 250, 0.14)",
          icon: <Moon size={14} />,
        }
      : hourOfDay >= 9 && hourOfDay < 13
      ? {
          label: "Deep Work Block (09:00–13:00)",
          desc: "Lets contacts know you're in focus hours and triages urgent notes.",
          color: "var(--l-amber)",
          bg: "rgba(251, 191, 36, 0.14)",
          icon: <Briefcase size={14} />,
        }
      : {
          label: "Available Window",
          desc: "AI replies naturally in real time with realistic typing delays.",
          color: "var(--l-mint)",
          bg: "rgba(94, 234, 212, 0.14)",
          icon: <Sun size={14} />,
        };

  // Deterministic hex preview for AES-256-GCM card
  const fakeCipher = (() => {
    const src = sampleKey || "gsk_empty";
    let hex = "";
    for (let i = 0; i < 36; i++) {
      const code = (src.charCodeAt(i % src.length) * (i + 17) + 97) % 256;
      hex += code.toString(16).padStart(2, "0");
    }
    return `iv:9f4a1c8e2b0d · tag:7e3c91a4 · ct:${hex.slice(0, 40)}...`;
  })();

  const personaIndex =
    persona === "casual" ? 0 : persona === "founder" ? 1 : 2;
  const modeIndex = mode === "auto" ? 0 : mode === "draft" ? 1 : 2;

  return (
    <div ref={rootRef} className={styles.root}>
      {/* ── Ambient Aurora & Grid Layer ── */}
      <div className={styles.bgLayer}>
        <div className={`${styles.aurora} ${styles.auroraA}`} />
        <div className={`${styles.aurora} ${styles.auroraB}`} />
        <div className={`${styles.aurora} ${styles.auroraC}`} />
        <div className={styles.grid} />
      </div>

      <div className={styles.content}>
        {/* ── Floating Pill Navbar ── */}
        <div className={styles.navWrap}>
          <nav className={styles.nav}>
            <Link href="/welcome" className={styles.brand}>
              <AniLogo size={30} />
              <span>Ani</span>
            </Link>

            <div className={styles.navLinks}>
              <a href="#playground" className={styles.navLink}>
                Live Playground
              </a>
              <a href="#features" className={styles.navLink}>
                Capabilities
              </a>
              <a href="#steps" className={styles.navLink}>
                3-Step Setup
              </a>
              <a href="#faq" className={styles.navLink}>
                FAQ
              </a>
            </div>

            <div className={styles.navActions}>
              <Link href="/login" className={`${styles.btn} ${styles.btnGhost}`}>
                Sign In
              </Link>
              <Link
                href="/login?mode=register"
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                <span>Get Started</span>
                <ArrowRight size={14} className={styles.btnArrow} />
              </Link>
            </div>
          </nav>
        </div>

        {/* ── Hero Section ── */}
        <div className={styles.container}>
          <section className={styles.hero}>
            <div>
              <div className={styles.eyebrow}>
                <span className={styles.eyebrowDot}>
                  <span className={styles.pulse} />
                  Live Telethon + Groq Engine
                </span>
                <span>Personal AI Agent for Telegram</span>
              </div>

              <h1 className={styles.h1}>
                Your Telegram,{" "}
                <span className={styles.h1Muted}>answered</span>{" "}
                <span className={styles.rotator}>
                  <span key={wordIdx} className={styles.rotatorWord}>
                    {ROTATING_WORDS[wordIdx]}
                  </span>
                </span>
              </h1>

              <p className={styles.lede}>
                Connect your personal Telegram account via QR code, plug in your
                Groq API key, and let an AI that remembers every contact reply
                for you—or draft responses for your one-click approval.
              </p>

              <div className={styles.heroCtas}>
                <Link
                  href="/login?mode=register"
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}
                >
                  <span>Launch Your Agent</span>
                  <ArrowRight size={16} className={styles.btnArrow} />
                </Link>
                <a
                  href="#playground"
                  className={`${styles.btn} ${styles.btnGhost} ${styles.btnLg}`}
                >
                  <Play size={14} />
                  <span>Try Live Simulator</span>
                </a>
              </div>

              <div className={styles.trustRow}>
                <span className={styles.trustItem}>
                  <CheckCircle2 size={15} color="var(--l-mint)" />
                  QR or Phone Code Link
                </span>
                <span className={styles.trustItem}>
                  <CheckCircle2 size={15} color="var(--l-mint)" />
                  AES-256-GCM Encrypted Keys
                </span>
                <span className={styles.trustItem}>
                  <CheckCircle2 size={15} color="var(--l-mint)" />
                  Auto-Pauses When You Text
                </span>
              </div>
            </div>

            {/* ── Interactive 3D Phone Stage ── */}
            <div
              className={styles.phoneStage}
              onMouseMove={handlePhoneMove}
              onMouseLeave={() => setTilt({ rx: 0, ry: 0 })}
            >
              <div className={styles.phoneGlow} />

              {/* Floating Chip 1: Memory */}
              <div
                className={`${styles.chip} ${styles.chipMemory} ${
                  heroStage === 1 ? styles.chipOn : ""
                }`}
              >
                <div
                  className={styles.chipIcon}
                  style={{
                    background: "rgba(167, 139, 250, 0.16)",
                    color: "var(--l-violet)",
                  }}
                >
                  <Brain size={16} />
                </div>
                <div>
                  <div className={styles.chipTitle}>Memory Recalled</div>
                  <div className={styles.chipSub}>
                    Berlin · Tuesday launch · Oat flat white
                  </div>
                </div>
              </div>

              {/* Floating Chip 2: Auto-Pause */}
              <div
                className={`${styles.chip} ${styles.chipPause} ${
                  heroStage === 3 ? styles.chipOn : ""
                }`}
              >
                <div
                  className={styles.chipIcon}
                  style={{
                    background: "rgba(94, 234, 212, 0.16)",
                    color: "var(--l-mint)",
                  }}
                >
                  <PauseCircle size={16} />
                </div>
                <div>
                  <div className={styles.chipTitle}>Owner Stepped In</div>
                  <div className={styles.chipSub}>
                    AI auto-paused for 30 mins
                  </div>
                </div>
              </div>

              {/* Floating Chip 3: Groq Speed */}
              <div
                className={`${styles.chip} ${styles.chipSpeed} ${
                  heroStage === 2 ? styles.chipOn : ""
                }`}
              >
                <div
                  className={styles.chipIcon}
                  style={{
                    background: "rgba(124, 124, 255, 0.18)",
                    color: "var(--l-indigo)",
                  }}
                >
                  <Zap size={16} />
                </div>
                <div>
                  <div className={styles.chipTitle}>Groq Llama 3.3 70B</div>
                  <div className={styles.chipSub}>
                    Generated in 180ms + human typing
                  </div>
                </div>
              </div>

              <div
                className={styles.phone}
                style={{
                  transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                }}
              >
                <div className={styles.phoneScreen}>
                  <div className={styles.notch} />

                  <div className={styles.chatHeader}>
                    <div className={styles.avatar}>M</div>
                    <div>
                      <div className={styles.chatName}>Maya Lin</div>
                      <div
                        className={`${styles.chatStatus} ${
                          heroStage === 3 ? styles.chatStatusPaused : ""
                        }`}
                      >
                        {heroStage === 3 ? (
                          <>
                            <PauseCircle size={11} />
                            <span>AI Paused · You took over</span>
                          </>
                        ) : (
                          <>
                            <span className={styles.pulse} />
                            <span>Ani Active · Memory synced</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className={styles.chatBody}>
                    <div className={`${styles.bubble} ${styles.bubbleIn}`}>
                      Hey! Swamped with the Tuesday launch — can we move our
                      coffee catch-up to Thursday afternoon?
                    </div>

                    {heroStage === 1 && (
                      <div className={styles.typing}>
                        <span />
                        <span />
                        <span />
                      </div>
                    )}

                    {heroStage >= 2 && (
                      <div className={`${styles.bubble} ${styles.bubbleOut}`}>
                        <div className={styles.bubbleTag}>
                          <Sparkles size={10} />
                          <span>Sent by Ani · Casual Persona</span>
                        </div>
                        thursday afternoon works great! good luck with the
                        tuesday launch btw, let&apos;s grab that oat flat white
                        around 3pm?
                      </div>
                    )}

                    {heroStage === 3 && (
                      <div className={`${styles.bubble} ${styles.bubbleOwner}`}>
                        <div
                          className={styles.bubbleTag}
                          style={{ color: "var(--l-mint)" }}
                        >
                          <Smartphone size={10} />
                          <span>You replied from phone · AI paused</span>
                        </div>
                        Actually let&apos;s do 4pm at Barn Roastery!
                      </div>
                    )}
                  </div>

                  <div className={styles.chatInput}>
                    {heroStage === 3
                      ? "AI snoozed for 30m while you chat..."
                      : "Ani is listening for new messages..."}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ── Infinite Capability Ticker ── */}
        <div className={styles.marquee}>
          <div className={styles.marqueeTrack}>
            {[...Array(2)].map((_, loopIdx) =>
              [
                { icon: <QrCode size={15} color="var(--l-mint)" />, text: "Instant QR Device Link" },
                { icon: <KeyRound size={15} color="var(--l-indigo)" />, text: "Bring Your Own Groq API Key" },
                { icon: <Brain size={15} color="var(--l-violet)" />, text: "Rolling Two-Tier Contact Memory" },
                { icon: <PauseCircle size={15} color="var(--l-mint)" />, text: "Zero-Collision Auto-Pause" },
                { icon: <FileEdit size={15} color="var(--l-amber)" />, text: "1-Click Draft Approval Mode" },
                { icon: <Clock size={15} color="var(--l-sky)" />, text: "Sleep & Deep-Work Queue" },
                { icon: <Layers size={15} color="var(--l-indigo)" />, text: "Burst Message Batching" },
                { icon: <ShieldCheck size={15} color="var(--l-mint)" />, text: "AES-256-GCM Encrypted Secrets" },
              ].map((item, idx) => (
                <span key={`${loopIdx}-${idx}`} className={styles.marqueeItem}>
                  {item.icon}
                  <span>{item.text}</span>
                </span>
              ))
            )}
          </div>
        </div>

        {/* ── Interactive Pipeline Playground ── */}
        <section id="playground" className={styles.section}>
          <div className={styles.container}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.kicker}>Interactive Sandbox</span>
              <h2 className={styles.h2}>
                Test the AI Pipeline Right in Your Browser
              </h2>
              <p className={styles.sub}>
                Switch personas, toggle between Auto-Reply, Draft Approval, and
                Sleep Mode, or type your own message to watch each stage of the
                engine light up live.
              </p>
            </div>

            <div data-reveal className={`${styles.play} ${styles.reveal}`}>
              <div className={styles.playInner}>
                {/* Left Controls */}
                <div className={styles.playSide}>
                  {/* Persona Selector */}
                  <div>
                    <div className={styles.ctrlLabel}>1. Persona Voice</div>
                    <div className={styles.segment}>
                      <div
                        className={styles.segThumb}
                        style={{
                          width: "calc((100% - 8px) / 3)",
                          left: `calc(4px + ${personaIndex} * ((100% - 8px) / 3))`,
                        }}
                      />
                      {(["casual", "founder", "executive"] as PersonaId[]).map(
                        (id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => setPersona(id)}
                            className={`${styles.segBtn} ${
                              persona === id ? styles.segBtnOn : ""
                            }`}
                          >
                            {PERSONAS[id].name}
                          </button>
                        )
                      )}
                    </div>
                    <p className={styles.hint}>{PERSONAS[persona].hint}</p>
                  </div>

                  {/* Mode Selector */}
                  <div>
                    <div className={styles.ctrlLabel}>2. Handling Mode</div>
                    <div className={styles.segment}>
                      <div
                        className={styles.segThumb}
                        style={{
                          width: "calc((100% - 8px) / 3)",
                          left: `calc(4px + ${modeIndex} * ((100% - 8px) / 3))`,
                        }}
                      />
                      {[
                        { id: "auto", label: "Auto", icon: <Zap size={12} /> },
                        { id: "draft", label: "Draft", icon: <FileEdit size={12} /> },
                        { id: "sleep", label: "Sleep", icon: <Moon size={12} /> },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMode(m.id as ReplyMode)}
                          className={`${styles.segBtn} ${
                            mode === m.id ? styles.segBtnOn : ""
                          }`}
                        >
                          {m.icon}
                          <span>{m.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trigger Scenarios */}
                  <div>
                    <div className={styles.ctrlLabel}>
                      3. Fire a Live Scenario
                    </div>
                    <div className={styles.presetList}>
                      <button
                        type="button"
                        onClick={() => runSimulation("coffee")}
                        className={styles.preset}
                      >
                        <span
                          className={styles.presetIcon}
                          style={{
                            background: "rgba(124, 124, 255, 0.14)",
                            color: "var(--l-indigo)",
                          }}
                        >
                          <Coffee size={14} />
                        </span>
                        <span>&ldquo;Move coffee to Thursday afternoon?&rdquo;</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => runSimulation("weekend")}
                        className={styles.preset}
                      >
                        <span
                          className={styles.presetIcon}
                          style={{
                            background: "rgba(167, 139, 250, 0.14)",
                            color: "var(--l-violet)",
                          }}
                        >
                          <MessageCircle size={14} />
                        </span>
                        <span>&ldquo;What are your plans this weekend?&rdquo;</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => runSimulation("urgent")}
                        className={styles.preset}
                      >
                        <span
                          className={styles.presetIcon}
                          style={{
                            background: "rgba(251, 113, 133, 0.14)",
                            color: "var(--l-rose)",
                          }}
                        >
                          <ShieldAlert size={14} />
                        </span>
                        <span>Test &ldquo;Urgent&rdquo; Handoff Keyword</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => runSimulation("owner")}
                        className={styles.preset}
                      >
                        <span
                          className={styles.presetIcon}
                          style={{
                            background: "rgba(94, 234, 212, 0.14)",
                            color: "var(--l-mint)",
                          }}
                        >
                          <Smartphone size={14} />
                        </span>
                        <span>Simulate Texting From Your Phone</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Pipeline + Live Stream */}
                <div className={styles.playMain}>
                  {/* 5-Stage Pipeline Header */}
                  <div className={styles.pipeline}>
                    {PIPELINE_STEPS.map((label, idx) => {
                      const isWarn = warnStage === idx;
                      const isDone = !isWarn && idx < activeStage;
                      const isCurrent = !isWarn && idx === activeStage;
                      return (
                        <div
                          key={label}
                          style={{ display: "flex", alignItems: "center", gap: 6 }}
                        >
                          <span
                            className={`${styles.stage} ${
                              isWarn
                                ? styles.stageWarn
                                : isCurrent
                                ? styles.stageActive
                                : isDone
                                ? styles.stageDone
                                : ""
                            }`}
                          >
                            {isDone ? (
                              <Check size={12} />
                            ) : (
                              <Cpu size={12} />
                            )}
                            <span>{label}</span>
                          </span>
                          {idx < PIPELINE_STEPS.length - 1 && (
                            <span className={styles.stageLine} />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Active Memory Banner */}
                  <div
                    style={{
                      padding: "10px 24px",
                      borderBottom: "1px solid var(--l-line)",
                      background: "rgba(124, 124, 255, 0.05)",
                      fontSize: 12,
                      color: "var(--l-muted)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Brain size={13} color="var(--l-violet)" />
                      <strong style={{ color: "var(--l-text)" }}>
                        Injected Memory:
                      </strong>{" "}
                      {PERSONAS[persona].memoryFact}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPlayMessages([
                          {
                            id: "reset-1",
                            role: "in",
                            text: "Hey! Super swamped with the Tuesday launch — any chance we can move our coffee catch-up to Thursday afternoon?",
                          },
                          {
                            id: "reset-2",
                            role: "out",
                            text: PERSONAS[persona].replies.coffee,
                            tag: `Groq Llama 3.3 70B · ${PERSONAS[persona].name} Persona`,
                          },
                        ])
                      }
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--l-muted)",
                        fontSize: 11.5,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <RotateCcw size={11} /> Clear chat
                    </button>
                  </div>

                  {/* Chat Stream */}
                  <div ref={playChatRef} className={styles.playChat}>
                    {playMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`${styles.bubble} ${styles.playBubble} ${
                          m.role === "in"
                            ? styles.bubbleIn
                            : m.role === "owner"
                            ? styles.bubbleOwner
                            : styles.bubbleOut
                        }`}
                        style={
                          m.isDraft
                            ? {
                                background: "rgba(251, 191, 36, 0.12)",
                                border: "1px dashed rgba(251, 191, 36, 0.6)",
                              }
                            : undefined
                        }
                      >
                        {m.tag && (
                          <div className={styles.bubbleTag}>
                            <Sparkles size={10} />
                            <span>{m.tag}</span>
                          </div>
                        )}
                        <div>
                          {m.text}
                          {m.streaming && <span className={styles.caret} />}
                        </div>

                        {m.isDraft && !m.streaming && (
                          <div className={styles.draftBar}>
                            <button
                              type="button"
                              onClick={() => approveDraftInPlay(m.id)}
                              className={`${styles.miniBtn} ${styles.miniBtnLight}`}
                            >
                              <Check size={12} /> Approve & Send
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Custom Message Input */}
                  <form
                    className={styles.playInputRow}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!customText.trim()) return;
                      const txt = customText.trim();
                      setCustomText("");
                      runSimulation("custom", txt);
                    }}
                  >
                    <input
                      type="text"
                      className={styles.playInput}
                      placeholder="Type any message as Maya and press Enter..."
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                    />
                    <button
                      type="submit"
                      className={`${styles.btn} ${styles.btnPrimary}`}
                    >
                      <Send size={14} />
                      <span>Send</span>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Bento Grid ── */}
        <section id="features" className={styles.section}>
          <div className={styles.container}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.kicker}>Interactive Capabilities</span>
              <h2 className={styles.h2}>
                Engineered to Feel Indistinguishable From You
              </h2>
              <p className={styles.sub}>
                Every card below is interactive—drag the 24-hour schedule slider,
                toggle auto-pause, or test the AES-256-GCM encryption preview.
              </p>
            </div>

            <div data-reveal className={`${styles.bento} ${styles.reveal}`}>
              {/* Card 1: Rolling Two-Tier Memory */}
              <div
                className={`${styles.card} ${styles.span4}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-violet)" }}
                >
                  <Brain size={19} />
                </div>
                <div className={styles.cardTitle}>
                  Two-Tier Rolling Contact Memory
                </div>
                <p className={styles.cardText}>
                  Every 5 messages, a background summarizer distills new facts
                  about each contact—jobs, cities, preferences, and upcoming
                  plans—so your agent remembers context months later without
                  blowing token limits.
                </p>
                <div className={styles.cardVisual}>
                  <div className={styles.facts}>
                    {MEMORY_FACTS.map((fact, idx) => (
                      <button
                        key={fact}
                        type="button"
                        onClick={() => setActiveFact(idx)}
                        className={`${styles.fact} ${
                          activeFact === idx ? styles.factOn : ""
                        }`}
                        style={{ cursor: "pointer" }}
                      >
                        {fact}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Card 2: Zero-Collision Auto-Pause */}
              <div
                className={`${styles.card} ${styles.span2}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-mint)" }}
                >
                  <PauseCircle size={19} />
                </div>
                <div className={styles.cardTitle}>
                  Zero-Collision Auto-Pause
                </div>
                <p className={styles.cardText}>
                  The instant you text a contact from your phone, Ani detects
                  your outgoing message and pauses in that chat.
                </p>
                <div className={styles.cardVisual}>
                  <div className={styles.pauseBox}>
                    <div className={styles.pauseTop}>
                      <span style={{ fontWeight: 600 }}>
                        {autoPauseOn
                          ? `Paused (${pauseRemaining}m left)`
                          : "AI Active in Chat"}
                      </span>
                      <button
                        type="button"
                        aria-label="Toggle auto pause simulation"
                        onClick={() => {
                          setAutoPauseOn(!autoPauseOn);
                          setPauseRemaining(30);
                        }}
                        className={`${styles.toggle} ${
                          autoPauseOn ? styles.toggleOn : ""
                        }`}
                      >
                        <span className={styles.toggleKnob} />
                      </button>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--l-muted)" }}>
                      Click toggle to simulate sending a text from your phone
                    </div>
                    <div className={styles.progress}>
                      <div
                        className={styles.progressFill}
                        style={{ width: autoPauseOn ? "78%" : "0%" }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Interactive 24-Hour Schedule Slider */}
              <div
                className={`${styles.card} ${styles.span3}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-sky)" }}
                >
                  <Clock size={19} />
                </div>
                <div className={styles.cardTitle}>
                  Interactive 24-Hour Life Schedule
                </div>
                <p className={styles.cardText}>
                  Drag the time slider to see how Ani adapts across your day,
                  work blocks, and sleep hours.
                </p>
                <div className={styles.cardVisual}>
                  <div className={styles.schedRow}>
                    <svg
                      width="84"
                      height="84"
                      viewBox="0 0 84 84"
                      className={styles.ring}
                    >
                      <circle
                        cx="42"
                        cy="42"
                        r="34"
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="7"
                        fill="none"
                      />
                      <circle
                        cx="42"
                        cy="42"
                        r="34"
                        stroke={scheduleMode.color}
                        strokeWidth="7"
                        strokeDasharray={`${(hourOfDay / 24) * 213} 213`}
                        strokeLinecap="round"
                        transform="rotate(-90 42 42)"
                        fill="none"
                      />
                      <text
                        x="50%"
                        y="53%"
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="14"
                        fontWeight="700"
                      >
                        {String(hourOfDay).padStart(2, "0")}:00
                      </text>
                    </svg>

                    <div className={styles.schedInfo}>
                      <div
                        className={styles.schedStatus}
                        style={{
                          background: scheduleMode.bg,
                          color: scheduleMode.color,
                        }}
                      >
                        {scheduleMode.icon}
                        <span>{scheduleMode.label}</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={23}
                        value={hourOfDay}
                        onChange={(e) => setHourOfDay(Number(e.target.value))}
                        className={styles.range}
                      />
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--l-muted)",
                          marginTop: 8,
                        }}
                      >
                        {scheduleMode.desc}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 4: Live AES-256-GCM Cipher Inspector */}
              <div
                className={`${styles.card} ${styles.span3}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-mint)" }}
                >
                  <Lock size={19} />
                </div>
                <div className={styles.cardTitle}>
                  AES-256-GCM Encrypted Vault
                </div>
                <p className={styles.cardText}>
                  Your Groq key and Telegram session string are encrypted before
                  touching Neon PostgreSQL. Type below to preview the sealed
                  payload:
                </p>
                <div className={styles.cardVisual}>
                  <input
                    type="text"
                    value={sampleKey}
                    onChange={(e) => setSampleKey(e.target.value)}
                    className={styles.playInput}
                    style={{
                      width: "100%",
                      marginBottom: 10,
                      padding: "8px 13px",
                      fontSize: 12.5,
                    }}
                    placeholder="Type a sample API key..."
                  />
                  <div className={styles.cipher}>
                    <div className={styles.cipherLabel}>
                      <ShieldCheck size={12} color="var(--l-mint)" />
                      <span>AES-256-GCM Sealed Output</span>
                    </div>
                    <div className={styles.cipherVal}>{fakeCipher}</div>
                  </div>
                </div>
              </div>

              {/* Card 5: Interactive Draft Approval Card */}
              <div
                className={`${styles.card} ${styles.span3}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-amber)" }}
                >
                  <FileEdit size={19} />
                </div>
                <div className={styles.cardTitle}>
                  1-Click Draft Approval Mode
                </div>
                <p className={styles.cardText}>
                  Prefer human-in-the-loop for VIP contacts? Let Ani draft the
                  response and approve or shorten it in one click:
                </p>
                <div className={styles.cardVisual}>
                  <div
                    className={`${styles.draftCard} ${
                      draftApproved ? styles.draftCardSent : ""
                    }`}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: draftApproved
                          ? "var(--l-mint)"
                          : "var(--l-amber)",
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {draftApproved ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Sent to Telegram</span>
                        </>
                      ) : (
                        <>
                          <FileEdit size={13} />
                          <span>Draft Awaiting Your Approval</span>
                        </>
                      )}
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                      {draftShort
                        ? "Sounds great — let's do Thursday at 3pm!"
                        : "Thursday afternoon at 3pm works great for me! Looking forward to catching up after your launch."}
                    </div>
                    <div className={styles.draftBar}>
                      <button
                        type="button"
                        onClick={() => setDraftApproved(!draftApproved)}
                        className={`${styles.miniBtn} ${styles.miniBtnLight}`}
                      >
                        <Check size={12} />
                        <span>{draftApproved ? "Reset Draft" : "Approve & Send"}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDraftShort(!draftShort)}
                        className={`${styles.miniBtn} ${styles.miniBtnDark}`}
                      >
                        <Edit3 size={12} />
                        <span>{draftShort ? "Expand" : "Make Shorter"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 6: Burst Message Batching */}
              <div
                className={`${styles.card} ${styles.span3}`}
                onMouseMove={handleCardMouseMove}
              >
                <div
                  className={styles.cardIcon}
                  style={{ color: "var(--l-indigo)" }}
                >
                  <Layers size={19} />
                </div>
                <div className={styles.cardTitle}>
                  Smart Burst Batching Window
                </div>
                <p className={styles.cardText}>
                  When someone sends three rapid-fire texts in a row, Ani waits
                  a few seconds to combine them and replies once naturally.
                </p>
                <div className={styles.cardVisual}>
                  <div className={styles.batchStage}>
                    <div className={styles.batchMsg}>hey!</div>
                    <div className={styles.batchMsg}>are you around later?</div>
                    <div className={styles.batchMsg}>
                      quick question about the deck
                    </div>
                    <div className={styles.batchReply}>
                      hey! yep i&apos;m around after 4pm, send the deck over!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 3-Step Animated Setup Section ── */}
        <section id="steps" className={styles.section}>
          <div className={styles.container}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.kicker}>60-Second Onboarding</span>
              <h2 className={styles.h2}>Go Live in Three Guided Steps</h2>
              <p className={styles.sub}>
                No servers to configure, no CLI scripts required. Everything
                happens inside the web onboarding wizard.
              </p>
            </div>

            <div
              data-reveal
              data-steps="true"
              className={`${styles.steps} ${styles.reveal}`}
            >
              <div className={styles.stepsLine}>
                <div
                  className={`${styles.stepsLineFill} ${
                    stepsLineOn ? styles.stepsLineFillOn : ""
                  }`}
                />
              </div>

              <div className={styles.step}>
                <div className={styles.stepNum}>
                  <KeyRound size={22} color="var(--l-indigo)" />
                </div>
                <div className={styles.stepTitle}>1. Paste Your Groq Key</div>
                <p className={styles.stepText}>
                  Grab a free API key from console.groq.com, paste it into the
                  wizard, and pick Llama 3.3 70B, Llama 4 Scout, or Qwen 3.
                </p>
              </div>

              <div className={styles.step}>
                <div className={styles.stepNum}>
                  <QrCode size={22} color="var(--l-mint)" />
                </div>
                <div className={styles.stepTitle}>2. Scan Telegram QR</div>
                <p className={styles.stepText}>
                  Scan the live QR code from Telegram → Settings → Devices (or
                  link with your phone number and login code).
                </p>
              </div>

              <div className={styles.step}>
                <div className={styles.stepNum}>
                  <Sparkles size={22} color="var(--l-violet)" />
                </div>
                <div className={styles.stepTitle}>
                  3. Test in Sandbox & Launch
                </div>
                <p className={styles.stepText}>
                  Pick a persona preset, chat with your AI clone in the live
                  sandbox, and flip your global agent switch on.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Smooth FAQ Accordion ── */}
        <section id="faq" className={styles.section}>
          <div className={styles.container}>
            <div data-reveal className={`${styles.sectionHead} ${styles.reveal}`}>
              <span className={styles.kicker}>Questions & Answers</span>
              <h2 className={styles.h2}>Everything You Need to Know</h2>
            </div>

            <div data-reveal className={`${styles.faq} ${styles.reveal}`}>
              {[
                {
                  q: "How does Ani reply directly from my personal Telegram account?",
                  a: "Ani connects using Telethon as a standard authorized session on your Telegram account—just like Telegram Desktop or Web. You can view or terminate the session at any time from your phone under Telegram → Settings → Devices.",
                },
                {
                  q: "What happens if I start texting someone myself on my phone?",
                  a: "The moment you send an outgoing message in a private chat, Ani detects it and automatically pauses AI replies for that contact (default 30 minutes, customizable in Settings) so you never talk over each other.",
                },
                {
                  q: "How are my Groq API key and Telegram session secured?",
                  a: "Both secrets are encrypted with AES-256-GCM before being stored in Neon PostgreSQL. They are never returned to the browser after saving, and clicking Disconnect permanently wipes your session.",
                },
                {
                  q: "Can I approve replies before they are sent?",
                  a: "Yes. You can switch your entire account or specific contacts into Draft Mode. Ani will generate the reply and hold it in your web Inbox so you can approve, edit, or discard it in one click.",
                },
              ].map((item, idx) => {
                const open = openFaq === idx;
                return (
                  <div
                    key={item.q}
                    className={`${styles.faqItem} ${
                      open ? styles.faqItemOpen : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={styles.faqQ}
                      onClick={() => setOpenFaq(open ? null : idx)}
                    >
                      <span>{item.q}</span>
                      <span className={styles.faqPlus}>
                        <Plus size={14} />
                      </span>
                    </button>
                    <div className={styles.faqA}>
                      <div className={styles.faqAInner}>
                        <p className={styles.faqAText}>{item.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Final Call to Action ── */}
            <div data-reveal className={`${styles.cta} ${styles.reveal}`}>
              <div className={styles.ctaOrb} />
              <div className={styles.ctaContent}>
                <h2 className={styles.h2} style={{ marginBottom: 12 }}>
                  Put Your Telegram Inbox on Autopilot
                </h2>
                <p
                  className={styles.sub}
                  style={{ maxWidth: 520, margin: "0 auto 28px" }}
                >
                  Create your account, connect your Groq API key and Telegram in
                  under a minute, and stay in full control of every conversation.
                </p>
                <Link
                  href="/login?mode=register"
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnLg}`}
                >
                  <span>Create Your Free Account</span>
                  <ArrowRight size={16} className={styles.btnArrow} />
                </Link>
              </div>
            </div>

            {/* ── Footer ── */}
            <footer className={styles.footer}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AniLogo size={22} />
                <span>Ani v2 · Personal Telegram AI Agent</span>
              </div>
              <div className={styles.footerLinks}>
                <a href="#playground">Playground</a>
                <a href="#features">Capabilities</a>
                <Link href="/login">Sign In</Link>
                <Link href="/login?mode=register">Get Started</Link>
              </div>
            </footer>
          </div>
        </section>
      </div>
    </div>
  );
}
