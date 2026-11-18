export const COLS = 18;
export const ROWS = 24;

export type Task =
  | { kind: "edge"; side: "left" | "right"; count: number; row: number }
  | { kind: "move"; dir: "right" | "left" | "down" | "up"; count: number };

export interface Level {
  id: string;
  name: string;
  subtitle: string;
  tasks: Task[];
}

export interface Cell {
  col: number;
  row: number;
}

export interface Target {
  col: number;
  row: number;
  // origin of the offset arrow (cell coords, floats allowed)
  from: { col: number; row: number };
  label: string;
}

export function kl(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "клетку";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "клетки";
  return "клеток";
}

export function taskText(t: Task): string {
  if (t.kind === "edge") {
    const side = t.side === "left" ? "слева" : "справа";
    return `Поставь точку на выделенной строке, сделав отступ ${side} — ${t.count} ${kl(t.count)} от края листа.`;
  }
  const dirWord = { right: "вправо", left: "влево", down: "вниз", up: "вверх" }[t.dir];
  return `Отступи ${dirWord} на ${t.count} ${kl(t.count)} от последней точки и поставь точку.`;
}

export function targetFor(task: Task, dots: Cell[]): Target {
  const last = dots.length > 0 ? dots[dots.length - 1] : { col: 0, row: 0 };
  const label = `${task.count} кл`;
  if (task.kind === "edge") {
    const col = task.side === "left" ? task.count : COLS - 1 - task.count;
    return {
      col,
      row: task.row,
      from: { col: task.side === "left" ? 0 : COLS - 1, row: task.row },
      label,
    };
  }
  switch (task.dir) {
    case "right":
      return { col: last.col + task.count, row: last.row, from: { ...last }, label };
    case "left":
      return { col: last.col - task.count, row: last.row, from: { ...last }, label };
    case "down":
      return { col: last.col, row: last.row + task.count, from: { ...last }, label };
    case "up":
      return { col: last.col, row: last.row - task.count, from: { ...last }, label };
  }
}

export function isValidChain(tasks: Task[]): boolean {
  const dots: Cell[] = [];
  for (const t of tasks) {
    const g = targetFor(t, dots);
    if (g.col < 0 || g.col >= COLS || g.row < 0 || g.row >= ROWS) return false;
    dots.push({ col: g.col, row: g.row });
  }
  return true;
}

export const LEVELS: Level[] = [
  {
    id: "l1",
    name: "Край листа",
    subtitle: "Учимся отступать от края тетради",
    tasks: [
      { kind: "edge", side: "left", count: 3, row: 4 },
      { kind: "move", dir: "down", count: 3 },
      { kind: "edge", side: "left", count: 6, row: 10 },
      { kind: "move", dir: "down", count: 3 },
    ],
  },
  {
    id: "l2",
    name: "Точка к точке",
    subtitle: "Отступаем от уже поставленной точки",
    tasks: [
      { kind: "edge", side: "left", count: 2, row: 4 },
      { kind: "move", dir: "right", count: 4 },
      { kind: "move", dir: "right", count: 4 },
      { kind: "move", dir: "down", count: 4 },
      { kind: "move", dir: "left", count: 3 },
      { kind: "move", dir: "down", count: 4 },
      { kind: "move", dir: "right", count: 5 },
    ],
  },
  {
    id: "l3",
    name: "Отступ справа",
    subtitle: "Считаем клеточки от правого края",
    tasks: [
      { kind: "edge", side: "right", count: 3, row: 6 },
      { kind: "move", dir: "down", count: 4 },
      { kind: "edge", side: "right", count: 5, row: 14 },
      { kind: "move", dir: "down", count: 3 },
      { kind: "edge", side: "right", count: 2, row: 20 },
    ],
  },
  {
    id: "l4",
    name: "Как в памятке",
    subtitle: "Размечаем страницу, как настоящий ученик",
    tasks: [
      { kind: "edge", side: "left", count: 10, row: 3 },
      { kind: "move", dir: "down", count: 2 },
      { kind: "edge", side: "left", count: 6, row: 6 },
      { kind: "move", dir: "down", count: 3 },
      { kind: "edge", side: "left", count: 3, row: 10 },
      { kind: "move", dir: "right", count: 4 },
      { kind: "move", dir: "down", count: 3 },
      { kind: "edge", side: "left", count: 3, row: 16 },
      { kind: "move", dir: "right", count: 5 },
    ],
  },
  {
    id: "l5",
    name: "Проверочная",
    subtitle: "Все отступы сразу — во все стороны!",
    tasks: [
      { kind: "edge", side: "left", count: 4, row: 18 },
      { kind: "move", dir: "up", count: 4 },
      { kind: "move", dir: "right", count: 8 },
      { kind: "move", dir: "up", count: 3 },
      { kind: "edge", side: "right", count: 3, row: 8 },
      { kind: "move", dir: "down", count: 5 },
      { kind: "move", dir: "left", count: 5 },
      { kind: "move", dir: "down", count: 4 },
    ],
  },
];

// sanity check at module load (development aid, tree-shaken in prod builds if unused)
if (typeof window !== "undefined") {
  for (const l of LEVELS) {
    if (!isValidChain(l.tasks)) {
      // eslint-disable-next-line no-console
      console.error(`Level ${l.id} has an invalid task chain`);
    }
  }
}
