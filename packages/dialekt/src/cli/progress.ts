const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

const COL_LOCALE = 9;
const COL_KEYS = 9;
const COL_CHUNKS = 8;
const COL_PROGRESS = 9;

interface Row {
  locale: string;
  resources: number;
  keys: number;
  chunks: number;
  completed: number;
  failed: number;
  status: "pending" | "translating" | "done" | "no-missing" | "error";
  startTime: number;
}

export class ProgressDisplay {
  private rows = new Map<string, Row>();
  private order: string[];
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private active = false;
  private drawn = 0;
  private fd: typeof process.stderr;

  constructor(entries: Array<{ locale: string; resources: number }>) {
    this.order = entries.map((e) => e.locale);
    for (const e of entries) {
      this.rows.set(e.locale, {
        locale: e.locale,
        resources: e.resources,
        keys: 0,
        chunks: 0,
        completed: 0,
        failed: 0,
        status: "pending",
        startTime: 0,
      });
    }
    this.fd = process.stderr;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.draw();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.draw();
    }, 100);
  }

  localeStarted(locale: string): void {
    const r = this.rows.get(locale);
    if (r && r.status === "pending") {
      r.status = "translating";
      r.startTime = Date.now();
    }
  }
  localeScanned(locale: string, keys: number, chunks: number): void {
    const r = this.rows.get(locale);
    if (r) {
      r.keys = keys;
      r.chunks = chunks;
      if (chunks === 0 && keys === 0) {
        r.status = "no-missing";
        r.startTime = Date.now();
      }
    }
  }
  chunkComplete(locale: string): void {
    const r = this.rows.get(locale);
    if (r && r.status === "translating") r.completed++;
  }
  chunkFailed(locale: string): void {
    const r = this.rows.get(locale);
    if (r) r.failed++;
  }
  localeDone(locale: string): void {
    const r = this.rows.get(locale);
    if (r && r.status !== "no-missing") r.status = "done";
  }
  localeError(locale: string): void {
    const r = this.rows.get(locale);
    if (r && r.status !== "done") r.status = "error";
  }

  /** Called before writing chunk output to stderr — pauses the timer. */
  beforeChunkOutput(): void {
    // Stop the animation timer so it doesn't interleave with card output.
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Rewind past the status line so the card renders above it.
    this.fd.write("\r\x1b[A\x1b[K");
  }

  /** Called after chunk output — restarts the timer and redraws. */
  afterChunkOutput(): void {
    // Restart the animation timer.
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.draw();
    }, 100);
    // Redraw the status line immediately.
    this.draw();
  }

  finish(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.active = false;
    this.draw();
    this.fd.write("\n");
  }

  private progressStr(row: Row): string {
    if (row.status === "no-missing") return GREEN + "—" + RESET;
    if (row.chunks === 0 && row.status === "done") return GREEN + "—" + RESET;
    if (row.status === "pending") return DIM + "···" + RESET;
    return `${row.completed + row.failed}/${row.chunks}`;
  }

  private draw(): void {
    if (this.drawn > 0) {
      for (let i = 0; i < this.drawn; i++) {
        this.fd.write("\x1b[1A\x1b[K");
      }
    }
    this.drawn = 0;

    for (const locale of this.order) {
      const row = this.rows.get(locale)!;
      const s =
        row.status === "translating"
          ? SPINNER[this.frame % SPINNER.length]! + " "
          : row.status === "pending"
            ? DIM + "··" + RESET + " "
            : "  ";

      const keysStr = row.keys > 0 ? String(row.keys) : DIM + "···" + RESET;
      const chunksStr = row.chunks > 0 ? String(row.chunks) : DIM + "···" + RESET;
      const progressStr = this.progressStr(row);

      let statusStr: string;
      switch (row.status) {
        case "pending":
          statusStr = DIM + "pending" + RESET;
          break;
        case "translating":
          statusStr = "translating";
          break;
        case "done": {
          const el = row.startTime > 0 ? ((Date.now() - row.startTime) / 1000).toFixed(1) : "0.0";
          statusStr = `${GREEN}✓${RESET} done ${DIM}${el}s${RESET}`;
          break;
        }
        case "no-missing":
          statusStr = `${GREEN}✓${RESET} ${DIM}complete${RESET}`;
          break;
        case "error":
          statusStr =
            row.failed > 0 ? `${RED}✗${RESET} ${row.failed} failed` : `${RED}✗${RESET} error`;
          break;
      }

      this.fd.write(
        `\r${s}${pad(row.locale, COL_LOCALE)} ${pad(keysStr, COL_KEYS)} ${pad(chunksStr, COL_CHUNKS)} ${pad(progressStr, COL_PROGRESS)} ${statusStr}\n`,
      );
      this.drawn++;
    }
  }
}

function pad(s: string, n: number): string {
  const plain = s.replace(/\x1b\[\d;]*m/g, "");
  const MIN_PAD = 0;
  const padLen = Math.max(MIN_PAD, n - plain.length);
  return s + " ".repeat(padLen);
}

// ── Status bar ──────────────────────────────────────────────────────────────

interface Slots {
  [locale: string]: { resource?: string; chunk?: string };
}

/**
 * A single-line animated status bar that shows what each concurrent thread
 * is currently working on. Chunk output is rendered above it via the
 * beforeOutput/afterOutput dance.
 */
export class StatusBar {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;
  private slots: Slots = {};
  private active = false;
  private fd = process.stderr;
  /** Guard to prevent timer redraws during chunk card output. */
  writing = false;

  /** Update a slot with the locale+resource the thread is working on. */
  setSlot(locale: string, resource: string, progress: string): void {
    this.slots[locale] = { resource, chunk: progress };
  }

  /** Clear a slot when a thread finishes its chunk. */
  clearSlot(locale: string): void {
    delete this.slots[locale];
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.draw();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER.length;
      this.draw();
    }, 100);
  }

  /** Redraws the bottom line in place. Skips if a chunk card is being written. */
  draw(): void {
    if (this.writing) return;
    this.fd.write("\r\x1b[K");

    const entries = Object.entries(this.slots);
    if (entries.length === 0) {
      this.fd.write(`${DIM}  waiting...${RESET}`);
    } else {
      const s = SPINNER[this.frame % SPINNER.length]!;
      const parts = entries.map(
        ([loc, { resource, chunk }]) =>
          `${CYAN}${loc}${RESET}/${DIM}${resource ?? "?"}${RESET} ${chunk ?? "?"}`,
      );
      this.fd.write(`${s}  ${parts.join("  ")}`);
    }
  }

  /**
   * Move cursor above status line, stop the animation timer,
   * and lock out concurrent chunk output.
   */
  beforeOutput(): void {
    this.writing = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.fd.write("\r\x1b[A\x1b[K");
  }

  /** Redraw status line and restart animation. */
  afterOutput(): void {
    // Flush with a microtask delay so the chunk card is fully written before redrawing.
    setImmediate(() => {
      this.fd.write("\r\x1b[K");
      this.draw();
      this.writing = false;
      if (!this.timer) {
        this.timer = setInterval(() => {
          this.frame = (this.frame + 1) % SPINNER.length;
          this.draw();
        }, 100);
      }
    });
  }

  finish(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.active = false;
    this.fd.write("\r\x1b[K"); // erase status line
  }
}
