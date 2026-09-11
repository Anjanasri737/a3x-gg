import { compilationAsIntelligence, compileConversationState, type ConversationCompilerInput } from "./conversation-state-compiler";

export async function compileAndPersistObservation(admin: any, observation: any, overrides: Partial<ConversationCompilerInput> = {}) {
  const previousQuery = observation.lead_id
    ? await admin.from("conversation_states").select("*").eq("lead_id", observation.lead_id).maybeSingle()
    : { data: null };
  const previousState = previousQuery.data;
  const compilation = compileConversationState({
    lastMessage: observation.last_message_preview,
    rawText: observation.raw_text,
    direction: observation.preview_direction,
    unreadVisible: observation.unread_visible,
    seenState: observation.seen_state,
    detectedLabel: observation.detected_label,
    colorHint: observation.color_hint,
    handlerHint: observation.handler_hint,
    ocrConfidence: observation.ocr_confidence,
    capturedAt: observation.captured_at ?? observation.created_at,
    previous: previousState ? {
      canonicalEvent: previousState.canonical_event,
      eventFamily: previousState.event_family,
      capturedAt: previousState.last_screenshot_at,
      momentum: previousState.momentum,
    } : null,
    ...overrides,
  });
  const original = observation.intelligence ?? null;
  const row = {
    observation_id: observation.id, lead_id: observation.lead_id, requirement_id: null,
    compiler_version: compilation.compilerVersion, rule_id: null, rule_version: 1,
    canonical_event: compilation.canonicalEvent, event_family: compilation.eventFamily,
    modifiers: compilation.modifiers, extracted_entities: compilation.entities,
    raw_labels: compilation.rawLabels, parsed_labels: compilation.parsedLabels,
    conversation_stage: compilation.conversationStage, waiting_on: compilation.waitingOn,
    blocker: compilation.blocker, intent: compilation.intent, health: compilation.health,
    movement: compilation.movement, momentum: compilation.momentum,
    next_action: compilation.nextAction, next_action_owner: compilation.nextActionOwner,
    action_due_at: compilation.actionDueAt, sla_status: compilation.slaStatus, priority: compilation.priority,
    screenshot_due_at: compilation.screenshotDueAt, screenshot_status: compilation.screenshotStatus,
    evidence_quality: compilation.evidenceQuality, confidence: compilation.confidence,
    automation_safe: compilation.automationSafe, needs_review: compilation.needsReview,
    reasons: compilation.reasons, original_interpretation: original, active_interpretation: true,
  };
  const { data: saved, error } = await admin.from("conversation_compilations").upsert(row, { onConflict: "observation_id,compiler_version" }).select("*").single();
  if (error) throw new Error(`Could not persist conversation compilation: ${error.message}`);

  if (observation.lead_id) {
    const capturedAt = observation.captured_at ?? observation.created_at ?? new Date().toISOString();
    const state = {
      lead_id: observation.lead_id, latest_observation_id: observation.id, latest_compilation_id: saved.id,
      canonical_event: compilation.canonicalEvent, event_family: compilation.eventFamily, modifiers: compilation.modifiers,
      extracted_entities: compilation.entities, conversation_stage: compilation.conversationStage,
      waiting_on: compilation.waitingOn, blocker: compilation.blocker, intent: compilation.intent,
      health: compilation.health, movement: compilation.movement, momentum: compilation.momentum,
      next_action: compilation.nextAction, next_action_owner: compilation.nextActionOwner,
      action_due_at: compilation.actionDueAt, sla_status: compilation.slaStatus, priority: compilation.priority,
      last_screenshot_at: capturedAt, screenshot_due_at: compilation.screenshotDueAt,
      screenshot_status: compilation.screenshotStatus, evidence_quality: compilation.evidenceQuality,
      confidence: compilation.confidence, automation_safe: compilation.automationSafe, needs_review: compilation.needsReview,
    };
    const { error: stateError } = await admin.from("conversation_states").upsert(state, { onConflict: "lead_id" });
    if (stateError) throw new Error(`Could not update current conversation state: ${stateError.message}`);
    await admin.from("conversation_transitions").upsert({
      lead_id: observation.lead_id, from_compilation_id: previousState?.latest_compilation_id ?? null,
      to_compilation_id: saved.id, from_event: previousState?.canonical_event ?? null,
      to_event: compilation.canonicalEvent, movement: compilation.movement,
      momentum_delta: compilation.momentum - Number(previousState?.momentum ?? 0), blocker: compilation.blocker,
    }, { onConflict: "to_compilation_id" });
  }
  if (compilation.canonicalEvent === "NEW_PATTERN_DETECTED" && observation.last_message_preview) {
    const normalized = String(observation.last_message_preview).toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 500);
    const existing = await admin.from("conversation_pattern_clusters").select("id,occurrence_count").eq("normalized_pattern", normalized).maybeSingle();
    if (existing.data) await admin.from("conversation_pattern_clusters").update({ occurrence_count: Number(existing.data.occurrence_count) + 1, last_seen_at: new Date().toISOString() }).eq("id", existing.data.id);
    else await admin.from("conversation_pattern_clusters").insert({ normalized_pattern: normalized, representative_text: observation.last_message_preview, suggested_family: compilation.eventFamily });
  }
  return { compilation, intelligence: compilationAsIntelligence(compilation), persisted: saved };
}