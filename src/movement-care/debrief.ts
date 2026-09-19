import type { CareGoal } from "./playbooks";

export interface DebriefInput {
  customerName: string;
  draftCode: string;
  goal: CareGoal;
  done: string;
  wentWell: string;
  wentBadly: string;
  problems: string;
  operatorName: string;
  resultNow: number;
  commitCount: number;
  property?: string;
  nextStep?: string;
  dueAt?: string;
}

const clean = (value: string, fallback: string) => (value.trim() ? value.trim() : fallback);

/** The message the operator copies and pastes into the team WhatsApp group. */
export function debriefMessage(input: DebriefInput) {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const lines = [
    `*${input.draftCode} update · ${input.customerName}*`,
    `${input.operatorName} · ${time} · ${input.goal}`,
    "",
    `✅ Done: ${clean(input.done, "not written")}`,
    `👍 Went well: ${clean(input.wentWell, "nothing noted")}`,
    `👎 Went badly: ${clean(input.wentBadly, "nothing noted")}`,
    `⚠️ Problem / help needed: ${clean(input.problems, "none")}`,
  ];
  if (input.property) lines.push(`🏠 Property in play: ${input.property}`);
  if (input.nextStep) lines.push(`➡️ Next step: ${input.nextStep}${input.dueAt ? ` by ${new Date(input.dueAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}`);
  lines.push("", `📊 My day so far: ${input.resultNow}/${input.commitCount} ${input.goal.toLowerCase()} results`);
  return lines.join("\n");
}
