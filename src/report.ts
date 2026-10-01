import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { z } from "zod";

const reportSchema = z.object({
  time: z.string(),
  cwd: z.string(),
  message: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["pending", "success", "error"]),
      detail: z.string(),
    }),
  ),
});

export type UpdateReport = z.infer<typeof reportSchema>;

export async function saveReport(path: string, report: UpdateReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

export async function loadReport(path: string): Promise<UpdateReport | undefined> {
  try {
    return reportSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function reportLines(theme: Theme, report: UpdateReport): string[] {
  return [
    theme.style("↑ AUTO-UPDATE", { fg: "accent", bold: true }),
    theme.style(report.message, { bold: true }),
    ...report.items.map((item) => {
      const color =
        item.status === "success" ? "success" : item.status === "error" ? "error" : "accent";

      const icon = item.status === "success" ? "✓" : item.status === "error" ? "✗" : "↻";

      return `${theme.fg(color, `${icon} ${item.name}`)} ${theme.fg("muted", item.detail)}`;
    }),
    theme.fg("dim", `${report.time} · ${report.cwd}`),
  ];
}

export function showReport(ctx: ExtensionContext, report: UpdateReport): void {
  ctx.ui.setWidget("autoupdate", (_tui, theme) => ({
    render(width) {
      return new Text(reportLines(theme, report).join("\n"), 1, 0).render(width);
    },
    invalidate() {},
  }));
}

export function clearReport(ctx: ExtensionContext): void {
  ctx.ui.setWidget("autoupdate", undefined);
}

export function notifyReport(
  ctx: ExtensionContext,
  report: UpdateReport,
  severity: "info" | "warning" | "error" = "info",
): void {
  const failed = report.items.filter((item) => item.status !== "success");

  ctx.ui.notify(
    [
      report.message,
      ...failed.map((item) => `${item.name}: ${item.detail}`),
      "Details: /autoupdate-report",
    ].join("\n"),
    failed.length > 0 ? "error" : severity,
  );
}

export async function openReport(ctx: ExtensionContext, report: UpdateReport): Promise<void> {
  await ctx.ui.custom<void>(
    (tui, theme, _keys, done) => {
      let offset = 0;
      let maxOffset = 0;

      return {
        render(width) {
          const innerWidth = Math.max(1, width - 2);
          const padding = Math.min(2, Math.max(0, Math.floor((innerWidth - 1) / 2)));
          const contentWidth = Math.max(1, innerWidth - padding * 2);

          const header = [
            theme.style("Auto-update report", { fg: "accent", bold: true }),
            theme.fg("muted", "Results from the last update run"),
          ];

          const footer = new Text(theme.fg("dim", "↑/↓ scroll · Esc/Enter close"), 0, 0).render(
            contentWidth,
          );

          const lines = new Text(reportLines(theme, report).slice(1).join("\n"), 0, 0).render(
            contentWidth,
          );

          // Reserve space for borders, header, divider, footer and vertical padding.
          const compact = tui.terminal.rows - 2 - 9 - footer.length < 1;
          const height = Math.max(1, tui.terminal.rows - 2 - (compact ? 5 : 9) - footer.length);
          maxOffset = Math.max(0, lines.length - height);
          offset = Math.min(offset, maxOffset);

          const border = (text: string) => theme.fg("border", text);

          const row = (text: string) =>
            border("│") +
            " ".repeat(padding) +
            truncateToWidth(text, contentWidth, "…", true) +
            " ".repeat(padding) +
            border("│");

          return [
            border(`╭${"─".repeat(innerWidth)}╮`),
            ...(compact ? [] : [row("")]),
            ...header.map(row),
            ...(compact ? [] : [row("")]),
            border(`├${"─".repeat(innerWidth)}┤`),
            ...lines.slice(offset, offset + height).map(row),
            ...(compact ? [] : [row("")]),
            ...footer.map(row),
            ...(compact ? [] : [row("")]),
            border(`╰${"─".repeat(innerWidth)}╯`),
          ];
        },
        handleInput(data) {
          if (
            matchesKey(data, "escape") ||
            matchesKey(data, "enter") ||
            matchesKey(data, "ctrl+c")
          ) {
            done();
          } else if (matchesKey(data, "up") || matchesKey(data, "down")) {
            offset = Math.max(0, Math.min(maxOffset, offset + (matchesKey(data, "up") ? -1 : 1)));
            tui.requestRender();
          }
        },
        invalidate() {},
      };
    },
    { overlay: true, overlayOptions: { anchor: "center", width: "50%", margin: 1 } },
  );
}
