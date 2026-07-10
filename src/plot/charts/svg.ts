/**
 * Internal SVG-string chart helpers (plan D5): a tiny, dependency-free layer
 * replicating the base-R-graphics look (white background, boxed plot region,
 * outward ticks, dotted lightgray grid, Helvetica text) for the four seminr
 * result plots. Not a general charting library — just what plot_results.R and
 * the PLSpredict error density need.
 */

/** Geometry mirrors R's default 7x7in device at 96 dpi with mar = c(5,4,4,2)+0.1 lines. */
export const DEVICE_SIZE = 672;
export const MARGIN = { top: 79, right: 40, bottom: 98, left: 79 } as const;

export const FONT_FAMILY = "Helvetica, Arial, sans-serif";
export const FONT_SIZE = 12;

/** A chart's pixel frame plus data limits; maps data coords to pixels. */
export interface Frame {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  xlim: readonly [number, number];
  ylim: readonly [number, number];
}

export function frame(
  xlim: readonly [number, number],
  ylim: readonly [number, number],
  width = DEVICE_SIZE,
  height = DEVICE_SIZE,
  margin = MARGIN,
): Frame {
  return { width, height, margin: { ...margin }, xlim, ylim };
}

export function xPos(f: Frame, x: number): number {
  const [x0, x1] = f.xlim;
  const plotWidth = f.width - f.margin.left - f.margin.right;
  return f.margin.left + ((x - x0) / (x1 - x0)) * plotWidth;
}

export function yPos(f: Frame, y: number): number {
  const [y0, y1] = f.ylim;
  const plotHeight = f.height - f.margin.top - f.margin.bottom;
  return f.height - f.margin.bottom - ((y - y0) / (y1 - y0)) * plotHeight;
}

/** Round pixel coordinates to keep the SVG source compact. */
export const px = (value: number): string =>
  String(Math.round(value * 100) / 100);

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function attrString(attrs: Record<string, string | number>): string {
  return Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${value}"`)
    .join("");
}

export function svgOpen(width: number, height: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="${FONT_FAMILY}" font-size="${FONT_SIZE}">\n` +
    `<rect width="${width}" height="${height}" fill="white"/>\n`
  );
}

export function svgClose(): string {
  return "</svg>\n";
}

export function svgLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrs: Record<string, string | number> = {},
): string {
  return `<line x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"${attrString({ stroke: "black", ...attrs })}/>\n`;
}

export function svgPolyline(
  points: readonly (readonly [number, number])[],
  attrs: Record<string, string | number> = {},
): string {
  const path = points.map(([x, y]) => `${px(x)},${px(y)}`).join(" ");
  return `<polyline points="${path}"${attrString({ fill: "none", stroke: "black", ...attrs })}/>\n`;
}

export function svgCircle(
  cx: number,
  cy: number,
  r: number,
  attrs: Record<string, string | number> = {},
): string {
  return `<circle cx="${px(cx)}" cy="${px(cy)}" r="${r}"${attrString(attrs)}/>\n`;
}

export function svgRect(
  x: number,
  y: number,
  width: number,
  height: number,
  attrs: Record<string, string | number> = {},
): string {
  return `<rect x="${px(x)}" y="${px(y)}" width="${px(width)}" height="${px(height)}"${attrString(attrs)}/>\n`;
}

export function svgPolygon(
  points: readonly (readonly [number, number])[],
  attrs: Record<string, string | number> = {},
): string {
  const path = points.map(([x, y]) => `${px(x)},${px(y)}`).join(" ");
  return `<polygon points="${path}"${attrString(attrs)}/>\n`;
}

export function svgText(
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number> = {},
): string {
  return `<text x="${px(x)}" y="${px(y)}"${attrString(attrs)}>${escapeXml(content)}</text>\n`;
}

/** R's default `xaxs`/`yaxs = "r"`: extend data limits by 4% of the range each side. */
export function extendRange(
  lim: readonly [number, number],
  fraction = 0.04,
): [number, number] {
  const pad = (lim[1] - lim[0]) * fraction;
  return [lim[0] - pad, lim[1] + pad];
}

/**
 * Tick positions in the spirit of R's `pretty()`: ~n intervals on a
 * 1/2/5 x 10^k step, expanded to whole steps inside the limits.
 */
export function prettyTicks(min: number, max: number, n = 5): number[] {
  if (!(max > min)) return [min];
  const rawStep = (max - min) / n;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const stepUnit = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = stepUnit * magnitude;
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let k = first; k <= last; k++) {
    // strip float noise (0.2 * 3 = 0.6000000000000001) and normalize -0
    ticks.push(Number((k * step).toPrecision(12)) + 0);
  }
  return ticks;
}

/** Compact tick-label formatting (strips float noise). */
export function tickLabel(value: number): string {
  return String(Math.round(value * 1e10) / 1e10);
}

const TICK_LENGTH = 6;

export interface AxesOptions {
  xTicks?: readonly number[];
  yTicks?: readonly number[];
  /** Custom x tick labels (defaults to numeric labels). */
  xTickLabels?: readonly string[];
  /** Rotate x tick labels by this many degrees (right-anchored), as R's las/srt. */
  xTickAngle?: number;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  /** Draw the full box (R bty = "o") instead of just the two axis lines. */
  box?: boolean;
}

/** Axis lines, outward ticks, tick labels, axis labels, and title. */
export function svgAxes(f: Frame, options: AxesOptions = {}): string {
  const {
    xTicks = prettyTicks(f.xlim[0], f.xlim[1]),
    yTicks = prettyTicks(f.ylim[0], f.ylim[1]),
    xTickLabels,
    xTickAngle = 0,
    xLabel,
    yLabel,
    title,
    box = true,
  } = options;

  const left = f.margin.left;
  const right = f.width - f.margin.right;
  const top = f.margin.top;
  const bottom = f.height - f.margin.bottom;

  let out = "";
  if (box) {
    out += svgRect(left, top, right - left, bottom - top, {
      fill: "none",
      stroke: "black",
    });
  } else {
    out += svgLine(left, bottom, right, bottom);
    out += svgLine(left, top, left, bottom);
  }

  for (let i = 0; i < xTicks.length; i++) {
    const tick = xTicks[i]!;
    const x = xPos(f, tick);
    out += svgLine(x, bottom, x, bottom + TICK_LENGTH);
    const label = xTickLabels?.[i] ?? tickLabel(tick);
    if (xTickAngle !== 0) {
      out += svgText(x, bottom + TICK_LENGTH + 12, label, {
        "text-anchor": "end",
        transform: `rotate(${-xTickAngle} ${px(x)} ${px(bottom + TICK_LENGTH + 12)})`,
      });
    } else {
      out += svgText(x, bottom + TICK_LENGTH + 14, label, { "text-anchor": "middle" });
    }
  }
  for (const tick of yTicks) {
    const y = yPos(f, tick);
    out += svgLine(left - TICK_LENGTH, y, left, y);
    out += svgText(left - TICK_LENGTH - 4, y + 4, tickLabel(tick), {
      "text-anchor": "end",
    });
  }

  if (xLabel !== undefined) {
    out += svgText((left + right) / 2, bottom + 48, xLabel, { "text-anchor": "middle" });
  }
  if (yLabel !== undefined) {
    const y = (top + bottom) / 2;
    out += svgText(left - 48, y, yLabel, {
      "text-anchor": "middle",
      transform: `rotate(-90 ${px(left - 48)} ${px(y)})`,
    });
  }
  if (title !== undefined) {
    out += svgText((left + right) / 2, top - 24, title, {
      "text-anchor": "middle",
      "font-size": 14,
      "font-weight": "bold",
    });
  }
  return out;
}

/** R `grid(col = "lightgray", lty = "dotted")` analogue over the tick grid. */
export function svgGrid(
  f: Frame,
  xTicks: readonly number[] = prettyTicks(f.xlim[0], f.xlim[1]),
  yTicks: readonly number[] = prettyTicks(f.ylim[0], f.ylim[1]),
): string {
  const left = f.margin.left;
  const right = f.width - f.margin.right;
  const top = f.margin.top;
  const bottom = f.height - f.margin.bottom;
  let out = "";
  for (const tick of xTicks) {
    const x = xPos(f, tick);
    out += svgLine(x, top, x, bottom, { stroke: "lightgray", "stroke-dasharray": "1,3" });
  }
  for (const tick of yTicks) {
    const y = yPos(f, tick);
    out += svgLine(left, y, right, y, { stroke: "lightgray", "stroke-dasharray": "1,3" });
  }
  return out;
}

/** A rendered SVG chart: the source string plus a browser-safe file saver. */
export class SvgPlot {
  constructor(readonly svg: string) {}

  toString(): string {
    return this.svg;
  }

  /** Save the SVG source to file (call-time `node:fs` import, plan D4). */
  async save(filename: string): Promise<void> {
    const extension = (filename.split(".").pop() ?? "").toLowerCase();
    if (extension !== "svg") {
      throw new Error(`Unsupported file type: '${extension}'. Please use svg.`);
    }
    let fs: typeof import("node:fs/promises");
    try {
      fs = await import("node:fs/promises");
    } catch (cause) {
      throw new Error(
        "Saving plots to file is not available in browsers; use the .svg " +
          "string yourself.",
        { cause },
      );
    }
    await fs.writeFile(filename, this.svg, "utf8");
  }
}
