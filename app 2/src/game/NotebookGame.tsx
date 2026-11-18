import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COLS,
  ROWS,
  LEVELS,
  targetFor,
  taskText,
  type Cell,
  type Level,
  type Target,
} from "./levels";
import { sfx, isMuted, setMuted } from "./sound";

type Screen = "title" | "play" | "levelDone" | "victory";
type Phase = "aim" | "feedback";

interface Dot extends Cell {
  id: number;
}

interface WrongMark extends Cell {
  id: number;
}

function loadStars(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("otstupy-stars") ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function saveStars(s: Record<string, number>) {
  try {
    localStorage.setItem("otstupy-stars", JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function Stars({ count, size = 22 }: { count: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 align-middle" aria-label={`${count} звезды из 3`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"
            fill={i < count ? "#f5a623" : "#d8d2c4"}
            stroke={i < count ? "#d98e06" : "#c4bdae"}
            strokeWidth="1"
          />
        </svg>
      ))}
    </span>
  );
}

// red double-headed offset arrow, in the style of the reference memory card
function OffsetArrow({
  from,
  to,
  label,
  cellW,
  cellH,
  animated,
}: {
  from: { col: number; row: number };
  to: { col: number; row: number };
  label: string;
  cellW: number;
  cellH: number;
  animated: boolean;
}) {
  const horizontal = from.row === to.row;
  if (horizontal) {
    const left = Math.min(from.col, to.col) * cellW;
    const width = Math.abs(to.col - from.col) * cellW;
    if (width < 4) return null;
    const top = (from.row + 0.5) * cellH;
    return (
      <div className="pointer-events-none absolute" style={{ left, top, width, height: 0 }}>
        <div className={`arrow-line-h ${animated ? "arrow-pop" : ""}`} />
        <div className="arrow-label" style={{ left: "50%" }}>
          {label}
        </div>
      </div>
    );
  }
  const top = Math.min(from.row, to.row) * cellH;
  const height = Math.abs(to.row - from.row) * cellH;
  if (height < 4) return null;
  const left = (from.col + 0.5) * cellW;
  return (
    <div className="pointer-events-none absolute" style={{ left, top, width: 0, height }}>
      <div className={`arrow-line-v ${animated ? "arrow-pop" : ""}`} />
      <div className="arrow-label arrow-label-v" style={{ top: "50%" }}>
        {label}
      </div>
    </div>
  );
}

function Pen({ x, y, visible }: { x: number; y: number; visible: boolean }) {
  return (
    <div
      className="pointer-events-none absolute z-20 transition-transform duration-75"
      style={{
        transform: `translate(${x}px, ${y}px) rotate(35deg)`,
        opacity: visible ? 1 : 0,
      }}
      aria-hidden="true"
    >
      <svg width="34" height="34" viewBox="0 0 34 34">
        <path d="M22 3l9 9-3.2 3.2-9-9z" fill="#1971c2" />
        <path d="M18.6 6.4l9 9L11 32l-8.4 1.4L4 25.2z" fill="#339af0" />
        <path d="M4 25.2L2.6 33.4 11 32z" fill="#343a40" />
        <path d="M18.6 6.4l9 9L11 32l-9 .6z" fill="#4dabf7" opacity="0.35" />
      </svg>
    </div>
  );
}

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 2.2,
        dur: 2.8 + Math.random() * 2,
        size: 7 + Math.random() * 7,
        color: ["#e03131", "#339af0", "#2f9e44", "#f5a623", "#ae3ec9"][i % 5],
        round: i % 3 === 0,
      })),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.55,
            background: p.color,
            borderRadius: p.round ? "50%" : 2,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function NotebookGame() {
  const [screen, setScreen] = useState<Screen>("title");
  const [levelIdx, setLevelIdx] = useState(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [taskIdx, setTaskIdx] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [taskMistakes, setTaskMistakes] = useState(0);
  const [phase, setPhase] = useState<Phase>("aim");
  const [hint, setHint] = useState(false);
  const [wrongMarks, setWrongMarks] = useState<WrongMark[]>([]);
  const [hover, setHover] = useState<Cell | null>(null);
  const [pointerFine, setPointerFine] = useState(false);
  const [stars, setStars] = useState<Record<string, number>>(loadStars);
  const [earnedStars, setEarnedStars] = useState(0);
  const [muted, setMutedState] = useState(isMuted());
  const [shake, setShake] = useState(0);

  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetSize, setSheetSize] = useState({ w: 0, h: 0 });
  const idRef = useRef(1);
  const timerRef = useRef<number | null>(null);

  const level: Level = LEVELS[levelIdx];
  const target: Target | null =
    screen === "play" && taskIdx < level.tasks.length ? targetFor(level.tasks[taskIdx], dots) : null;

  // measure sheet
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSheetSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSheetSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [screen]);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    setPointerFine(mq.matches);
    const fn = (e: MediaQueryListEvent) => setPointerFine(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const cellW = sheetSize.w / COLS;
  const cellH = sheetSize.h / ROWS;

  const startLevel = useCallback((idx: number) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setLevelIdx(idx);
    setDots([]);
    setTaskIdx(0);
    setMistakes(0);
    setTaskMistakes(0);
    setPhase("aim");
    setHint(false);
    setWrongMarks([]);
    setHover(null);
    setScreen("play");
  }, []);

  const finishLevel = useCallback(
    (totalMistakes: number, idx: number) => {
      const earned = totalMistakes === 0 ? 3 : totalMistakes <= 2 ? 2 : 1;
      setEarnedStars(earned);
      setStars((prev) => {
        const next = { ...prev, [LEVELS[idx].id]: Math.max(prev[LEVELS[idx].id] ?? 0, earned) };
        saveStars(next);
        return next;
      });
      sfx.win();
      timerRef.current = window.setTimeout(() => {
        setScreen(idx === LEVELS.length - 1 ? "victory" : "levelDone");
      }, 900);
    },
    []
  );

  const place = useCallback(
    (col: number, row: number) => {
      if (screen !== "play" || phase !== "aim" || !target) return;
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
      sfx.unlock();
      if (col === target.col && row === target.row) {
        sfx.correct();
        const dot: Dot = { col, row, id: idRef.current++ };
        setDots((d) => [...d, dot]);
        setPhase("feedback");
        const isLast = taskIdx === level.tasks.length - 1;
        timerRef.current = window.setTimeout(() => {
          if (isLast) {
            finishLevel(mistakes, levelIdx);
          } else {
            setTaskIdx((t) => t + 1);
            setTaskMistakes(0);
            setHint(false);
            setPhase("aim");
          }
        }, 1400);
      } else {
        sfx.wrong();
        setMistakes((m) => m + 1);
        setTaskMistakes((m) => m + 1);
        setWrongMarks((w) => [...w, { col, row, id: idRef.current++ }]);
        setShake((s) => s + 1);
        if (taskMistakes + 1 >= 2) setHint(true);
      }
    },
    [screen, phase, target, taskIdx, level, mistakes, levelIdx, taskMistakes, finishLevel]
  );

  const cellFromEvent = useCallback(
    (e: React.PointerEvent): Cell | null => {
      const el = sheetRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const col = Math.floor(((e.clientX - rect.left) / rect.width) * COLS);
      const row = Math.floor(((e.clientY - rect.top) / rect.height) * ROWS);
      if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
      return { col, row };
    },
    []
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (screen !== "play") return;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      if (e.key in moves) {
        e.preventDefault();
        const [dc, dr] = moves[e.key];
        setHover((h) => {
          const base = h ?? { col: 0, row: 0 };
          return {
            col: Math.min(COLS - 1, Math.max(0, base.col + dc)),
            row: Math.min(ROWS - 1, Math.max(0, base.row + dr)),
          };
        });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (hover) place(hover.col, hover.row);
      }
    },
    [screen, hover, place]
  );

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) sfx.click();
  }, [muted]);

  const totalStars = LEVELS.reduce((s, l) => s + (stars[l.id] ?? 0), 0);
  const doneLevels = LEVELS.filter((l) => (stars[l.id] ?? 0) > 0).length;
  const firstUnfinished = LEVELS.findIndex((l) => !(stars[l.id] > 0));
  const playIndex = firstUnfinished === -1 ? 0 : firstUnfinished;
  const showGuideRow =
    screen === "play" && target !== null && level.tasks[taskIdx]?.kind === "edge"
      ? (level.tasks[taskIdx] as { row: number }).row
      : null;

  return (
    <div className="game-root min-h-100dvh">
      {screen === "victory" && <Confetti />}

      {/* ---------- TITLE ---------- */}
      {screen === "title" && (
        <div className="mx-auto flex min-h-100dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-10">
          <div className="paper-card w-full max-w-xl p-6 text-center sm:p-10">
            <h1 className="font-hand text-5xl font-bold leading-tight text-[#1c3879] sm:text-6xl">
              Отступы в тетради
            </h1>
            <p className="mx-auto mt-3 max-w-md text-lg font-semibold text-[#495057]">
              Научись ставить точки с правильными отступами — как настоящий аккуратный ученик!
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-base font-bold text-[#868e96]">
              <Stars count={Math.min(3, Math.round(totalStars / Math.max(1, doneLevels)))} size={18} />
              <span>
                {totalStars} / {LEVELS.length * 3} звёзд
              </span>
            </div>
            <button
              className="btn-primary mt-6 w-full text-xl sm:w-auto sm:px-12"
              onClick={() => {
                sfx.unlock();
                sfx.click();
                startLevel(playIndex);
              }}
            >
              {doneLevels > 0 && doneLevels < LEVELS.length ? "Продолжить" : "Играть"}
            </button>
            <p className="mt-3 text-sm font-semibold text-[#868e96]">
              Веди ручку по листу и нажми, чтобы поставить точку. На компьютере работают стрелки и Enter.
            </p>
          </div>
          <div className="grid w-full max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
            {LEVELS.map((l, i) => (
              <button
                key={l.id}
                className="paper-card level-btn flex flex-col items-center gap-1 p-3"
                onClick={() => {
                  sfx.unlock();
                  sfx.click();
                  startLevel(i);
                }}
              >
                <span className="text-xs font-extrabold uppercase tracking-wide text-[#1971c2]">
                  Уровень {i + 1}
                </span>
                <span className="font-hand text-2xl font-bold leading-none text-[#343a40]">{l.name}</span>
                <Stars count={stars[l.id] ?? 0} size={16} />
              </button>
            ))}
            <button
              className="paper-card level-btn flex flex-col items-center justify-center gap-1 p-3"
              onClick={() => {
                sfx.unlock();
                sfx.click();
                try {
                  localStorage.removeItem("otstupy-stars");
                } catch {
                  /* ignore */
                }
                setStars({});
              }}
            >
              <span className="font-hand text-2xl font-bold leading-none text-[#e03131]">Заново</span>
              <span className="text-xs font-bold text-[#868e96]">сбросить звёзды</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------- PLAY ---------- */}
      {screen === "play" && (
        <div className="mx-auto flex min-h-100dvh w-full max-w-5xl flex-col gap-3 px-3 py-3 sm:px-6 sm:py-5">
          {/* top bar */}
          <div className="flex items-center gap-2">
            <button
              className="btn-chip"
              onClick={() => {
                sfx.click();
                if (timerRef.current) window.clearTimeout(timerRef.current);
                setScreen("title");
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              Меню
            </button>
            <div className="flex-1 text-center">
              <span className="text-xs font-extrabold uppercase tracking-wide text-[#1971c2]">
                Уровень {levelIdx + 1} · {level.name}
              </span>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                {level.tasks.map((_, i) => (
                  <span
                    key={i}
                    className={`task-pip ${i < taskIdx ? "pip-done" : i === taskIdx ? "pip-now" : ""}`}
                  />
                ))}
              </div>
            </div>
            <button
              className="btn-chip"
              onClick={() => {
                sfx.click();
                startLevel(levelIdx);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Заново
            </button>
            <button className="btn-chip" onClick={toggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"}>
              {muted ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 5L6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
                  <path d="M22 9l-6 6M16 9l6 6" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 5L6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
                  <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
                </svg>
              )}
            </button>
          </div>

          {/* task card */}
          <div key={`${levelIdx}-${taskIdx}-${shake}`} className={`task-card ${shake > 0 && taskMistakes > 0 ? "" : ""}`}>
            <span className="font-hand text-3xl font-bold leading-tight text-[#343a40]">
              {taskIdx + 1}. {target ? taskText(level.tasks[taskIdx]) : ""}
            </span>
            {taskMistakes > 0 && phase === "aim" && (
              <span className="text-sm font-extrabold text-[#e03131]">
                Почти! Ошибок подряд: {taskMistakes}. Попробуй ещё раз.
              </span>
            )}
            <button
              className="btn-hint"
              onClick={() => {
                sfx.click();
                setHint((h) => !h);
              }}
            >
              {hint ? "Скрыть подсказку" : "Подсказка"}
            </button>
          </div>

          {/* sheet */}
          <div className="flex flex-1 items-center justify-center">
            <div
              ref={sheetRef}
              className={`sheet ${pointerFine ? "sheet-fine" : ""}`}
              role="application"
              aria-label="Тетрадный лист в клетку. Нажми, чтобы поставить точку."
              tabIndex={0}
              onKeyDown={onKeyDown}
              onPointerMove={(e) => {
                const c = cellFromEvent(e);
                setHover(c);
              }}
              onPointerLeave={() => setHover(null)}
              onPointerDown={(e) => {
                const c = cellFromEvent(e);
                if (c) setHover(c);
              }}
              onPointerUp={(e) => {
                const c = cellFromEvent(e);
                if (c) {
                  setHover(c);
                  place(c.col, c.row);
                }
              }}
            >
              {/* red margin line, like a real notebook */}
              <div className="margin-line" aria-hidden="true" />

              {/* guide row for edge tasks */}
              {showGuideRow !== null && (
                <div
                  className="guide-row"
                  style={{ top: (showGuideRow / ROWS) * 100 + "%", height: 100 / ROWS + "%" }}
                  aria-hidden="true"
                />
              )}

              {/* target pulse when hint is on */}
              {hint && target && phase === "aim" && (
                <div
                  className="target-pulse"
                  style={{
                    left: ((target.col + 0.5) / COLS) * 100 + "%",
                    top: ((target.row + 0.5) / ROWS) * 100 + "%",
                  }}
                  aria-hidden="true"
                />
              )}

              {/* offset arrows: hint (origin->target) or feedback (origin->last dot) */}
              {cellW > 0 &&
                ((hint && target && phase === "aim") || phase === "feedback") &&
                target &&
                (() => {
                  const dest =
                    phase === "feedback" && dots.length > 0
                      ? { col: dots[dots.length - 1].col + 0.5, row: dots[dots.length - 1].row + 0.5 }
                      : { col: target.col + 0.5, row: target.row + 0.5 };
                  const from =
                    target.from.col === 0 || target.from.col === COLS - 1
                      ? { col: target.from.col, row: target.from.row + 0.5 }
                      : { col: target.from.col + 0.5, row: target.from.row + 0.5 };
                  // keep arrow on one axis: if same row -> horizontal, else vertical
                  if (from.row === dest.row) {
                    return (
                      <OffsetArrow
                        from={{ col: from.col, row: from.row }}
                        to={{ col: dest.col, row: dest.row }}
                        label={target.label}
                        cellW={cellW}
                        cellH={cellH}
                        animated
                      />
                    );
                  }
                  return (
                    <OffsetArrow
                      from={{ col: from.col, row: from.row }}
                      to={{ col: dest.col, row: dest.row }}
                      label={target.label}
                      cellW={cellW}
                      cellH={cellH}
                      animated
                    />
                  );
                })()}

              {/* ink dots */}
              {dots.map((d) => (
                <div
                  key={d.id}
                  className="ink-dot"
                  style={{ left: ((d.col + 0.5) / COLS) * 100 + "%", top: ((d.row + 0.5) / ROWS) * 100 + "%" }}
                  aria-hidden="true"
                />
              ))}

              {/* wrong marks */}
              {wrongMarks.map((w) => (
                <div
                  key={w.id}
                  className="wrong-mark"
                  style={{ left: ((w.col + 0.5) / COLS) * 100 + "%", top: ((w.row + 0.5) / ROWS) * 100 + "%" }}
                  aria-hidden="true"
                >
                  ×
                </div>
              ))}

              {/* pen */}
              {hover && cellW > 0 && (
                <Pen
                  x={(hover.col + 0.85) * cellW}
                  y={(hover.row + 0.1) * cellH}
                  visible={pointerFine || true}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---------- LEVEL DONE ---------- */}
      {screen === "levelDone" && (
        <div className="mx-auto flex min-h-100dvh w-full max-w-xl flex-col items-center justify-center px-4">
          <div className="paper-card w-full p-8 text-center">
            <h2 className="font-hand text-5xl font-bold text-[#1c3879]">Уровень пройден!</h2>
            <div className="mt-5 flex items-center justify-center gap-2">
              <Stars count={earnedStars} size={40} />
            </div>
            <p className="mt-3 text-lg font-bold text-[#495057]">
              {earnedStars === 3
                ? "Безупречно! Ни одной ошибки."
                : earnedStars === 2
                  ? "Отлично! Ещё чуть-чуть до трёх звёзд."
                  : "Готово! Попробуй пройти без ошибок."}
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                className="btn-secondary"
                onClick={() => {
                  sfx.click();
                  startLevel(levelIdx);
                }}
              >
                Пройти ещё раз
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  sfx.click();
                  startLevel(levelIdx + 1);
                }}
              >
                Следующий уровень
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- VICTORY ---------- */}
      {screen === "victory" && (
        <div className="mx-auto flex min-h-100dvh w-full max-w-xl flex-col items-center justify-center px-4">
          <div className="paper-card w-full p-8 text-center">
            <h2 className="font-hand text-5xl font-bold leading-tight text-[#1c3879]">
              Ты — мастер отступов!
            </h2>
            <p className="mt-4 text-lg font-bold text-[#495057]">
              Все уровни пройдены. Твоя тетрадь теперь самая аккуратная!
            </p>
            <div className="mt-4 flex items-center justify-center gap-2 text-lg font-extrabold text-[#868e96]">
              <Stars count={3} size={24} />
              <span>
                {totalStars} / {LEVELS.length * 3} звёзд
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                className="btn-secondary"
                onClick={() => {
                  sfx.click();
                  setScreen("title");
                }}
              >
                В меню
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  sfx.click();
                  startLevel(0);
                }}
              >
                Играть снова
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
