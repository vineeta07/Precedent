/* Offline eval: runs the labelled cases through the deterministic judge and prints precision/recall.
   The LLM judge is evaluated on a real site from Settings → Diagnostics → Run AI eval. */
import { runEval } from '../src/ai/eval/run';

async function main() {
  const report = await runEval({ llm: null });
  console.log(JSON.stringify(report, null, 2));
  if (report.precision < 0.85) {
    console.error(`precision ${report.precision} is below the 0.85 bar`);
    process.exit(1);
  }
}

void main();
