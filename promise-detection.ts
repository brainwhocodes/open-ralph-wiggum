function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isInsideMarkdownFence(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const lines = before.split(/\r?\n/);
  let activeFence: "```" | "~~~" | null = null;

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      activeFence = activeFence === "```" ? null : "```";
      continue;
    }

    if (trimmed.startsWith("~~~")) {
      activeFence = activeFence === "~~~" ? null : "~~~";
    }
  }

  return activeFence !== null;
}

/**
 * Check if output contains a valid completion promise.
 *
 * To avoid false positives, we require the promise to appear in a real
 * <promise>...</promise> tag that stands alone on its line.
 */
export function checkCompletion(output: string, promise: string): boolean {
  const escapedPromise = escapeRegex(promise);
  const promisePattern = new RegExp(`<promise>\\s*${escapedPromise}\\s*</promise>`, "gi");

  const matches = output.matchAll(promisePattern);

  for (const match of matches) {
    const matchText = match[0];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;

    const lineStart = output.lastIndexOf("\n", matchIndex - 1) + 1;
    const lineEndSearch = output.indexOf("\n", matchIndex + matchText.length);
    const lineEnd = lineEndSearch === -1 ? output.length : lineEndSearch;
    const line = output.substring(lineStart, lineEnd);

    // Promise must be the only meaningful content on its line.
    if (line.trim() !== matchText.trim()) {
      continue;
    }

    // Ignore examples embedded in fenced markdown blocks.
    if (isInsideMarkdownFence(output, matchIndex)) {
      continue;
    }

    const contextBefore = output.substring(Math.max(0, matchIndex - 100), matchIndex).toLowerCase();

    // Check for negation patterns before the promise
    const negationPatterns = [
      /\bnot\s+(yet\s+)?(say|output|write|respond|print)/,
      /\bdon'?t\s+(say|output|write|respond|print)/,
      /\bwon'?t\s+(say|output|write|respond|print)/,
      /\bwill\s+not\s+(say|output|write|respond|print)/,
      /\bshould\s+not\s+(say|output|write|respond|print)/,
      /\bwouldn'?t\s+(say|output|write|respond|print)/,
      /\bavoid\s+(saying|outputting|writing)/,
      /\bwithout\s+(saying|outputting|writing)/,
      /\bbefore\s+(saying|outputting|I\s+say)/,
      /\buntil\s+(I\s+)?(say|output|can\s+say)/,
    ];

    const hasNegation = negationPatterns.some(pattern => pattern.test(contextBefore));
    if (hasNegation) continue;

    // Check if inside quotes (model explaining what it will say)
    const quotesBefore = (contextBefore.match(/["'`]/g) || []).length;
    // Odd number of quotes means we're inside a quoted string
    if (quotesBefore % 2 === 1) continue;

    return true;
  }

  return false;
}
