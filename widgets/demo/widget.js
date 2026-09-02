const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, name);

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }

  return element;
}

function addText(parent, text, attributes) {
  const element = svgElement("text", attributes);
  element.textContent = text;
  parent.append(element);
  return element;
}

function evenlySpacedTicks([minimum, maximum], count) {
  return Array.from(
    { length: count + 1 },
    (_, index) => minimum + ((maximum - minimum) * index) / count,
  );
}

function formatTick(value) {
  if (Math.abs(value) < 1e-10) return "0";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * Render a dependency-free SVG line chart from generic {x, y} point data.
 * Observable supplies the reactive values; this module only handles drawing.
 */
export function renderLineChart({
  points,
  xDomain,
  yDomain,
  xLabel = "x",
  yLabel = "y",
  accessibleLabel = "Line chart",
}) {
  const width = 560;
  const height = 340;
  const margin = { top: 22, right: 22, bottom: 48, left: 58 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const [xMinimum, xMaximum] = xDomain;
  const [yMinimum, yMaximum] = yDomain;

  const xScale = (value) =>
    margin.left + ((value - xMinimum) / (xMaximum - xMinimum)) * innerWidth;
  const yScale = (value) =>
    margin.top + ((yMaximum - value) / (yMaximum - yMinimum)) * innerHeight;

  const svg = svgElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": accessibleLabel,
    class: "demo-line-chart",
  });

  const title = svgElement("title");
  title.textContent = accessibleLabel;
  svg.append(title);

  const plotBackground = svgElement("rect", {
    x: margin.left,
    y: margin.top,
    width: innerWidth,
    height: innerHeight,
    class: "chart-background",
  });
  svg.append(plotBackground);

  const xTicks = evenlySpacedTicks(xDomain, 4);
  const yTicks = evenlySpacedTicks(yDomain, 4);
  const grid = svgElement("g", { class: "chart-grid" });

  for (const tick of xTicks) {
    const position = xScale(tick);
    grid.append(
      svgElement("line", {
        x1: position,
        x2: position,
        y1: margin.top,
        y2: margin.top + innerHeight,
      }),
    );
    addText(grid, formatTick(tick), {
      x: position,
      y: margin.top + innerHeight + 22,
      "text-anchor": "middle",
      class: "chart-tick-label",
    });
  }

  for (const tick of yTicks) {
    const position = yScale(tick);
    grid.append(
      svgElement("line", {
        x1: margin.left,
        x2: margin.left + innerWidth,
        y1: position,
        y2: position,
      }),
    );
    addText(grid, formatTick(tick), {
      x: margin.left - 10,
      y: position + 4,
      "text-anchor": "end",
      class: "chart-tick-label",
    });
  }

  svg.append(grid);

  const axes = svgElement("g", { class: "chart-axes" });
  const horizontalAxis = yMinimum <= 0 && yMaximum >= 0 ? yScale(0) : yScale(yMinimum);
  const verticalAxis = xMinimum <= 0 && xMaximum >= 0 ? xScale(0) : xScale(xMinimum);
  axes.append(
    svgElement("line", {
      x1: margin.left,
      x2: margin.left + innerWidth,
      y1: horizontalAxis,
      y2: horizontalAxis,
    }),
    svgElement("line", {
      x1: verticalAxis,
      x2: verticalAxis,
      y1: margin.top,
      y2: margin.top + innerHeight,
    }),
  );
  svg.append(axes);

  const validPoints = points.filter(
    ({ x, y }) => Number.isFinite(x) && Number.isFinite(y),
  );
  const pathData = validPoints
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${xScale(x)},${yScale(y)}`)
    .join(" ");

  svg.append(
    svgElement("path", {
      d: pathData,
      class: "chart-line",
    }),
  );

  addText(svg, xLabel, {
    x: margin.left + innerWidth,
    y: height - 10,
    "text-anchor": "end",
    class: "chart-axis-label",
  });
  addText(svg, yLabel, {
    x: 16,
    y: margin.top,
    "text-anchor": "start",
    class: "chart-axis-label",
  });

  return svg;
}
