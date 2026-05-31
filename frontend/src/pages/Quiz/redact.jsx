// Backend marks each redacted word as ⁣[REDACT:n]⁣ (U+2063 invisible separators as parser anchors).
// Split on that and render each as a fixed-width bar sized to the hidden word — a deliberate
// redaction, never a missing-font tofu box. Shared by the plot stem (QuizPlay) and connect tokens
// (QuizConnect); a no-op for token-free text (returns the text as a single node).
export function renderRedactedPlot(text) {
  const re = /⁣\[REDACT:(\d+)\]⁣/g;
  const nodes = [];
  let last = 0;
  let key = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const n = Math.max(2, parseInt(m[1], 10) || 3);
    nodes.push(<span key={`r${key++}`} className="redact-block" style={{ width: `${n}ch` }} aria-label="zensiert" />);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
