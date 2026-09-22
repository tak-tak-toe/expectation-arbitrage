import { DEADLINE, DEFAULT_WORKER, DEFAULT_MANAGER, phi, phiPrime, expectation, reviewScoreAtTime } from "./model.js";
import {
  createWidgetRoot, createPanel, createLegend, createFrame, sampleRange,
  addPath, addCircle, addHorizontalLine, svgElement, formatNumber, mountResponsive,
} from "./widget-utils.js";

// Fixed teaching examples; all quality and evaluation values use the shared model.
const TIME_LABEL = "業務時間の実経過時間 t（時間）";
const WORK_LABEL = "累積実作業時間 w（時間）";
const EXAMPLES = {
  time: ["二つの時間", "作業 → 休憩 → 作業の順に、実経過時間と累積実作業時間を比べます。"],
  quality: ["品質と残る改善力", "上段は累積品質、下段は着手直後を1とした追加作業の改善力です。"],
  expectation: ["期待水準の切片と傾き", "開始時点の期待水準と、時間とともに期待する改善ペースを読み取ります。"],
  score: ["品質と期待の差を読む", "同じ時刻の縦の差を、レビュー時評価として別の軸へ写します。"],
  exponential: ["漸近値と立ち上がり", "介入前の基準曲線の漸近値を80に揃え、κだけを変えた曲線を比較します。"],
};

function label(frame, x, y, text, attributes = {}) {
  const element = svgElement("text", {
    x: frame.xScale(x), y: frame.yScale(y),
    "text-anchor": "middle", ...attributes,
  });
  element.textContent = text;
  frame.overlay.append(element);
}

function segment(frame, x1, y1, x2, y2, className = "mw-marker") {
  frame.overlay.append(svgElement("line", {
    x1: frame.xScale(x1), y1: frame.yScale(y1),
    x2: frame.xScale(x2), y2: frame.yScale(y2), class: className,
  }));
}

export function renderReviewConcept(kind) {
  if (!Object.hasOwn(EXAMPLES, kind)) throw new RangeError("Unknown review concept.");
  const [title, description] = EXAMPLES[kind];
  const instance = createWidgetRoot(title, description);
  instance.status.remove();
  const panel = createPanel(title, description);
  // The widget header already supplies the caption and explanation.
  instance.root.append(panel.chart);
  const cleanups = [];
  const samples = sampleRange(DEADLINE);

  mountResponsive(panel.chart, width => {
    const frame = createFrame({
      id: instance.id + "-concept", width, height: 285,
      xDomain: [0, DEADLINE],
      yDomain: kind === "time" ? [0, 27] : [0, 100],
      title, description,
      xLabel: ["quality", "exponential"].includes(kind) ? WORK_LABEL : TIME_LABEL,
      yLabel: kind === "time" ? "累積実作業時間 w(t)" : "品質水準",
    });
    let legend = [];

    if (kind === "time") {
      frame.background.append(svgElement("rect", {
        x: frame.xScale(10), y: frame.plotTop,
        width: frame.xScale(15) - frame.xScale(10),
        height: frame.plotBottom - frame.plotTop, class: "mw-band",
      }));
      addPath(frame, [{ x: 0, y: 0 }, { x: 25, y: 25 }], "mw-muted");
      addPath(frame, [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 15, y: 10 }, { x: 25, y: 20 }], "mw-primary");
      for (const x of [10, 15]) {
        segment(frame, x, 0, x, 10);
        addCircle(frame, x, 10);
      }
      label(frame, 5, 25, "作業");
      label(frame, 12.5, 25, "休憩");
      label(frame, 21, 25, "再び作業");
      label(frame, 12.5, 7, "w(t) = 10");
      legend = [["mw-swatch-primary", "t = 10〜15に休憩する w(t)"], ["mw-swatch-muted", "連続作業の w(t) = t"]];
    } else if (kind === "quality") {
      addPath(frame, samples.map(x => ({ x, y: phi(x) })), "mw-primary");
      for (const [start, color] of [[0, "mw-secondary"], [10, "mw-accent"]]) {
        const end = start + 1;
        segment(frame, start, phi(start), end, phi(start), color + " mw-line");
        segment(frame, end, phi(start), end, phi(end), color + " mw-line");
        addCircle(frame, end, phi(end));
      }
      legend = [
        ["mw-swatch-primary", "基準品質 Φ(w)（概形の一例）"],
        ["mw-swatch-secondary", "0→1時間の改善幅：" + formatNumber(phi(1) - phi(0))],
        ["mw-swatch-accent", "10→11時間の改善幅：" + formatNumber(phi(11) - phi(10))],
      ];
      const productivityFrame = createFrame({
        id: instance.id + "-productivity", width, height: 240,
        xDomain: [0, DEADLINE], yDomain: [0, 1.1],
        title: "相対限界生産性 p(w)",
        description: "着手直後の1から、作業とともに追加作業の改善力の比が低下します。",
        xLabel: WORK_LABEL, yLabel: "相対限界生産性 p(w)",
      });
      const relativeProductivity = w => phiPrime(w) / phiPrime(0);
      addPath(productivityFrame, samples.map(x => ({ x, y: relativeProductivity(x) })), "mw-secondary");
      addCircle(productivityFrame, 0, 1);
      label(productivityFrame, 1, 1, "p(0) = 1", { "text-anchor": "start" });
      const exampleWork = Math.log(1 / 0.4) / DEFAULT_WORKER.kappa;
      addCircle(productivityFrame, exampleWork, relativeProductivity(exampleWork));
      segment(productivityFrame, exampleWork, 0, exampleWork, 0.4);
      label(productivityFrame, exampleWork + 1, 0.45, "p(w) = 0.4：着手直後の40%", { "text-anchor": "start" });
      panel.chart.replaceChildren(frame.svg, createLegend(legend), productivityFrame.svg, createLegend([
        ["mw-swatch-secondary", "相対限界生産性 p(w) = Φ′(w) / Φ′(0)"],
      ]));
      return;
    } else if (kind === "expectation") {
      addPath(frame, samples.map(x => ({ x, y: expectation(x) })), "mw-accent");
      addCircle(frame, 0, DEFAULT_MANAGER.e0);
      label(frame, 1, DEFAULT_MANAGER.e0 + 8, "E₀ = 20", { "text-anchor": "start" });
      const start = 10;
      const end = 15;
      segment(frame, start, expectation(start), end, expectation(start), "mw-secondary mw-line");
      segment(frame, end, expectation(start), end, expectation(end), "mw-secondary mw-line");
      label(frame, 12.5, expectation(start) - 8, "5時間");
      label(frame, 16, expectation(12.5), "5β = 15", { "text-anchor": "start" });
      legend = [["mw-swatch-accent", "期待水準 E(t)"], ["mw-swatch-secondary", "β = 15 ÷ 5 = 3（品質／時間）"]];
    } else if (kind === "exponential") {
      for (const [kappa, color] of [[0.1, "mw-muted"], [0.25, "mw-primary"], [0.5, "mw-secondary"]]) {
        addPath(frame, samples.map(x => ({ x, y: phi(x, { ...DEFAULT_WORKER, kappa }) })), color);
      }
      addHorizontalLine(frame, 80);
      label(frame, 17, 90, "Q∞ = 80");
      legend = [["mw-swatch-muted", "κ = 0.10"], ["mw-swatch-primary", "κ = 0.25"], ["mw-swatch-secondary", "κ = 0.50"], ["mw-swatch-threshold", "基準曲線の共通の漸近値 Q∞"]];
    } else {
      const selectedTime = 8;
      const quality = phi(selectedTime);
      const expected = expectation(selectedTime);
      const score = reviewScoreAtTime(selectedTime);
      addPath(frame, samples.map(x => ({ x, y: phi(x) })), "mw-primary");
      addPath(frame, samples.map(x => ({ x, y: expectation(x) })), "mw-accent");
      segment(frame, selectedTime, expected, selectedTime, quality, "mw-secondary mw-line");
      addCircle(frame, selectedTime, quality);
      addCircle(frame, selectedTime, expected);
      label(frame, selectedTime + 1, (quality + expected) / 2, "差 = " + formatNumber(score), { "text-anchor": "start" });
      const scoreFrame = createFrame({
        id: instance.id + "-difference", width, height: 240,
        xDomain: [0, DEADLINE], yDomain: [-25, 35],
        title: "品質と期待の差から得られる評価",
        description: "上図の時刻8時間における縦の差が、評価Sの高さに対応します。",
        xLabel: TIME_LABEL, yLabel: "レビュー時評価 S(t)",
      });
      addPath(scoreFrame, samples.map(x => ({ x, y: reviewScoreAtTime(x) })), "mw-secondary");
      segment(scoreFrame, selectedTime, 0, selectedTime, score);
      addCircle(scoreFrame, selectedTime, score);
      label(scoreFrame, 13, score + 6, "t = 8、S = " + formatNumber(score));
      panel.chart.replaceChildren(frame.svg, scoreFrame.svg, createLegend([
        ["mw-swatch-primary", "品質 Φ(t)"], ["mw-swatch-accent", "期待水準 E(t)"], ["mw-swatch-secondary", "差 S(t)"],
      ]));
      return;
    }
    panel.chart.replaceChildren(frame.svg, createLegend(legend));
  }, cleanups);

  instance.root.dispose = () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
  return instance.root;
}
