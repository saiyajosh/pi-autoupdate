import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import {
  clearReport,
  notifyReport,
  openReport,
  showReport,
  type UpdateReport,
} from "../src/report.js";

const completedReport: UpdateReport = {
  time: "2026-09-30T23:09:18.240Z",
  cwd: "/project",
  message: "Restart complete · running Pi 0.99.2.",
  items: [{ name: "Pi", status: "success", detail: "0.99.1 → 0.99.2 · verified" }],
};

test("progress is removable and completion/error feedback does not pin widgets", () => {
  const widgets: boolean[] = [];
  const notifications: string[] = [];

  // SAFETY: these helpers only call setWidget and notify, supplied by this fake.
  const ctx = Object.assign({} as ExtensionContext, {
    ui: {
      setWidget: (_key: string, content: Parameters<ExtensionContext["ui"]["setWidget"]>[1]) => {
        widgets.push(content !== undefined);
      },
      notify: (message: string, severity: string) => notifications.push(`${severity}: ${message}`),
    },
  });

  showReport(ctx, completedReport);
  clearReport(ctx);
  notifyReport(ctx, completedReport);
  notifyReport(ctx, {
    ...completedReport,
    message: "Auto-update incomplete",
    items: [{ name: "example", status: "error", detail: "installed revision did not advance" }],
  });
  notifyReport(ctx, completedReport, "warning");
  assert.deepEqual(widgets, [true, false]);
  assert.match(notifications[0]!, /^info: Restart complete/);
  assert.match(notifications[0]!, /\/autoupdate-report/);
  assert.match(notifications[1]!, /^error:.*\nexample: installed revision did not advance/);
  assert.match(notifications[2]!, /^warning:/);
});

test("report opens a fresh overlay, scrolls long reports, and closes via Escape, Enter or Ctrl+C", async () => {
  for (const closeKey of ["\u001b", "\r", "\u0003"]) {
    let closed = false;
    let renders = 0;

    // SAFETY: openReport only calls ui.custom, supplied here to exercise the component.
    const ctx = Object.assign({} as ExtensionContext, {
      ui: {
        custom: async (
          factory: Parameters<ExtensionContext["ui"]["custom"]>[0],
          options: Parameters<ExtensionContext["ui"]["custom"]>[1],
        ) => {
          assert.equal(options?.overlay, true);
          assert.deepEqual(options?.overlayOptions, { anchor: "center", width: "50%", margin: 1 });

          // SAFETY: the component only reads terminal.rows and calls requestRender.
          const tui = Object.assign({} as TUI, {
            terminal: { rows: 14 },
            requestRender: () => renders++,
          });

          // SAFETY: rendering only calls style and fg, provided as identity functions here.
          const theme = Object.assign({} as Theme, {
            style: (text: string) => text,
            fg: (_color: string, text: string) => text,
          });

          // SAFETY: the component does not access the keybindings manager.
          const component = await factory(tui, theme, {} as Parameters<typeof factory>[2], () => {
            closed = true;
          });

          const first = component.render(40);
          assert.match(first.join("\n"), /Auto-update report/);
          assert.match(first.join("\n"), /Results from the last update run/);
          assert.match(first.join("\n"), /Esc\/Enter close/);
          assert.equal(first[0], `╭${"─".repeat(38)}╮`);
          assert.equal(first.at(-1), `╰${"─".repeat(38)}╯`);
          assert.match(first[2]!, /^│ {2}Auto-update report/);
          assert.ok(first.every((line) => visibleWidth(line) === 40));
          assert.ok(first.length <= tui.terminal.rows - 2);

          for (const width of [20, 60, 100]) {
            const resized = component.render(width);
            assert.ok(resized.every((line) => visibleWidth(line) === width));
            assert.ok(resized.length <= tui.terminal.rows - 2);
          }

          component.render(40);
          component.handleInput?.("\u001b[B");
          const second = component.render(40);
          assert.notDeepEqual(second, first);
          component.handleInput?.("\u001b[A");
          assert.deepEqual(component.render(40), first);
          assert.equal(closed, false);
          component.handleInput?.(closeKey);
        },
      },
    });

    await openReport(ctx, {
      ...completedReport,
      items: Array.from({ length: 25 }, (_, i) => ({
        name: `extension-${i}`,
        status: "success" as const,
        detail: "1.0.0 → 1.0.1 · installed revision verified",
      })),
    });
    assert.equal(closed, true);
    assert.equal(renders, 2);
  }
});
