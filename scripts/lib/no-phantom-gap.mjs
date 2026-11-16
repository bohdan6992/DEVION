import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * "Phantom gap": a wrapper that ALWAYS renders but whose only child is conditional.
 *
 *     <div className="...">        <- always a flex/grid child
 *       {cond && (                 <- ...with nothing in it when cond is false
 *         ...
 *       )}
 *     </div>
 *
 * The empty child has no height, but the PARENT's `gap-*` still reserves the space between it and
 * the sibling above. The row then reads as having more padding below than above — which looks like
 * a styling bug in the row, not like an empty element underneath it. That is how it was reported:
 * "why is the bottom padding larger" on ArbitrageScout, 2026-11-14. It was in 18 files.
 *
 * The fix is to hoist the condition outside the wrapper, so nothing renders at all:
 *
 *     {cond && (
 *       <div className="...">...</div>
 *     )}
 *
 * DELIBERATELY CONSERVATIVE, and that part is load-bearing. It fires only when the conditional is
 * the div's ONLY child: the first `)}` at the child indent must be followed immediately by that
 * div's own `</div>`. A div with SEVERAL conditional children is a different thing — each can
 * appear on its own, so the right fix there is one combined guard, not hoisting any single one. An
 * earlier, looser version of this check matched the wrong `</div>` on ActiveTickerCard and broke
 * the file; the extra strictness here is that bug's scar tissue.
 */

const OPEN_DIV = /^(\s*)<div className=(?:"[^"]*"|\{[^}]*\})>\s*$/;
const COND_OPEN = /^\s*\{[A-Za-z_$][\w$.?[\]"' ]*\s*&&\s*\($/;
const HAS_GAP = /\bgap(-[xy])?-\d/;
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function tsxFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFilesUnder(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Does the nearest ENCLOSING element charge a gap for an empty child? */
function parentHasGap(lines, from) {
  let depth = 0;
  for (let k = from - 1; k >= 0 && k > from - 400; k -= 1) {
    const t = lines[k].trim();
    if (t.startsWith("</div>")) {
      depth += 1;
      continue;
    }
    if (t.startsWith("<div")) {
      if (depth > 0) {
        depth -= 1;
        continue;
      }
      const cm = /className="([^"]*)"/.exec(lines[k]);
      return Boolean(cm && HAS_GAP.test(cm[1]));
    }
  }
  return false;
}

/** -> array of human-readable findings, empty when the tree is clean. */
export function findPhantomGaps(root, dirs = ["components"]) {
  const found = [];
  for (const d of dirs) {
    for (const full of tsxFilesUnder(join(root, d))) {
      const lines = readFileSync(full, "utf8").split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const m = OPEN_DIV.exec(lines[i]);
        if (!m) continue;
        if (!COND_OPEN.test(lines[i + 1] ?? "")) continue;

        const ind = m[1];
        let close = -1;
        for (let j = i + 2; j < Math.min(i + 200, lines.length); j += 1) {
          if (lines[j] === ind + "  )}") {
            close = j;
            break;
          }
        }
        if (close < 0) continue;
        if (lines[close + 1] !== ind + "</div>") continue;   // other children follow: not this bug
        if (!parentHasGap(lines, i)) continue;               // no gap to charge: costs nothing

        const where = relative(root, full).replace(/\\/g, "/");
        found.push(
          `${where}:${i + 1}: this <div> always renders but its only child is conditional, so when ` +
          `that is false it is an empty flex child and the parent's gap still reserves the space. ` +
          `Hoist the condition outside the wrapper.`
        );
      }
    }
  }
  return found;
}
