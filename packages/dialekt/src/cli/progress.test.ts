import { describe, expect, it, vi } from "vitest";
import { StatusBar } from "./progress.js";

describe("StatusBar", () => {
  it("sets writing flag during beforeOutput and clears after afterOutput", async () => {
    const bar = new StatusBar();
    // stub out timer and fd writes to avoid side effects
    const fd = { write: () => {} } as unknown as NodeJS.WriteStream;
    Object.defineProperty(bar, "fd", { value: fd, writable: true });

    bar.setSlot("en", "cms", "⏳");
    expect(bar.writing).toBe(false);

    bar.beforeOutput();
    expect(bar.writing).toBe(true);

    await new Promise<void>((resolve) => {
      bar.afterOutput();
      // afterOutput uses setImmediate, so wait a tick
      setImmediate(() => {
        expect(bar.writing).toBe(false);
        resolve();
      });
    });
  });

  it("draw() skips rendering when writing flag is set", () => {
    const bar = new StatusBar();
    const writes: string[] = [];
    const fd = {
      write: (s: string) => {
        writes.push(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    Object.defineProperty(bar, "fd", { value: fd, writable: true });

    bar.setSlot("fr", "estates", "⏳");
    bar.draw();
    // Should have produced some output
    expect(writes.length).toBeGreaterThan(0);

    // Now set writing flag — draw should be a no-op
    const before = writes.length;
    bar.writing = true;
    bar.draw();
    expect(writes.length).toBe(before);
  });

  it("beforeOutput clears timer", () => {
    const bar = new StatusBar();
    // Start the timer, then immediately pause it via beforeOutput.
    bar.start();
    expect((bar as any).timer).not.toBeNull();

    bar.beforeOutput();
    expect((bar as any).timer).toBeNull();
    bar.finish();
  });

  it("concurrent beforeOutput calls don't deadlock", () => {
    const bar = new StatusBar();
    const fd = {
      write: (s: string) => true,
    } as unknown as NodeJS.WriteStream;
    Object.defineProperty(bar, "fd", { value: fd, writable: true });

    // Two concurrent "threads" entering beforeOutput
    bar.beforeOutput();
    bar.beforeOutput();
    expect(bar.writing).toBe(true);

    bar.afterOutput();
    bar.afterOutput();
    // should not throw
  });

  it("clearSlot removes entry from status line", () => {
    const bar = new StatusBar();
    const writes: string[] = [];
    const fd = {
      write: (s: string) => {
        writes.push(s);
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    Object.defineProperty(bar, "fd", { value: fd, writable: true });

    // Don't call start() — we want manual draw() control.
    bar.setSlot("en", "cms", "⏳");
    bar.setSlot("fr", "estates", "⏳");
    bar.draw();

    // draw() may write multiple chunks (erase + content). Collect all into one string.
    const all = writes.join("");
    expect(all).toContain("en");
    expect(all).toContain("fr");

    bar.clearSlot("en");
    bar.draw();
    // After clearing "en", only "fr" should remain.
    const afterClearEn = writes.join("");
    expect(afterClearEn).not.toContain("/cms");
    expect(afterClearEn).toContain("fr");

    bar.clearSlot("fr");
    bar.draw();
    const afterClearFr = writes.join("");
    expect(afterClearFr).toContain("waiting");
  });
});
