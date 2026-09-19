DO $$
DECLARE
  accounts text[] := ARRAY['Kora WA-01','Kora WA-02','Kora WA-03','HSR WA-01','BTM WA-01','Indiranagar WA-01','Whitefield WA-01','Marathahalli WA-01'];
  checkpoints text[] := ARRAY['10:30','1 PM','5 PM','8 PM'];
  ops text[] := ARRAY['Diya','Abhay','Nikhil','Riya','Aman','Sneha','Vikas','Pooja'];
  op_ids uuid[];
  d int; a int; c int; o int; r int;
  b_id uuid; batch_uuid uuid; shot_id uuid;
  exp int; det int; res int; rev int; nonc int;
  lead_ids uuid[];
  n int; li int := 1;
  ts timestamptz;
BEGIN
  IF EXISTS (SELECT 1 FROM public.flow_draft_batches LIMIT 1) THEN RETURN; END IF;

  SELECT array_agg(id ORDER BY created_at DESC) INTO lead_ids FROM public.leads;
  n := coalesce(array_length(lead_ids,1),0);
  IF n = 0 THEN RETURN; END IF;
  SELECT array_agg(gen_random_uuid()) INTO op_ids FROM generate_series(1,8);

  FOR d IN 0..2 LOOP
    FOR a IN 1..array_length(accounts,1) LOOP
      FOR c IN 1..array_length(checkpoints,1) LOOP
        ts := date_trunc('day', now()) - (d || ' days')::interval + ((8 + c*3) || ' hours')::interval;
        IF ts > now() THEN CONTINUE; END IF;
        exp := 28 + floor(random()*18)::int;
        det := exp - (CASE WHEN random() < 0.2 THEN floor(random()*4)::int ELSE 0 END);
        rev := floor(random()*4)::int;
        nonc := floor(random()*3)::int;
        res := greatest(det - rev - nonc, 0);
        batch_uuid := gen_random_uuid();
        shot_id := gen_random_uuid();
        INSERT INTO public.screenshot_batches
          (id, whatsapp_account, capture_window_start, capture_window_end, uploaded_at,
           screenshot_count, visible_rows_expected, rows_segmented, rows_reconciled, unresolved_count,
           detected_rows_total, status, metadata, created_at, updated_at)
        VALUES
          (batch_uuid, accounts[a], ts - interval '20 minutes', ts, ts,
           4 + floor(random()*4)::int, exp, det, res, rev, det,
           CASE WHEN exp > det THEN 'incomplete' WHEN rev > 0 THEN 'review' ELSE 'complete' END,
           jsonb_build_object('checkpoint', checkpoints[c], 'uploaded_by', ops[1 + (a % 8)],
                              'processing_ms', 4000 + floor(random()*9000)::int,
                              'duplicate_rows', floor(random()*3)::int,
                              'duplicate_screenshots', CASE WHEN random() < 0.15 THEN 1 ELSE 0 END,
                              'errors', CASE WHEN random() < 0.1 THEN 1 ELSE 0 END),
           ts, ts);

        INSERT INTO public.whatsapp_screenshots
          (id, batch_id, whatsapp_account, captured_at, uploaded_at, visible_row_count,
           processing_status, extraction_model, extraction_version, extraction_confidence,
           ai_visible_row_count, file_name, created_at, updated_at)
        VALUES
          (shot_id, batch_uuid, accounts[a], ts, ts, det, 'extracted',
           'gemini-2.5-flash', 'draft-vision-2', 0.7 + random()*0.29, det,
           'wa-' || replace(accounts[a], ' ', '-') || '-' || to_char(ts, 'DDMM-HH24MI') || '.png', ts, ts);

        FOR r IN 1..least(det, 14) LOOP
          li := 1 + ((li + r + a*7 + c*3 + d*11) % n);
          INSERT INTO public.screenshot_observations
            (id, screenshot_id, batch_id, whatsapp_account, row_index, contact_name, phone_raw, phone_normalized, lead_id,
             visible_timestamp_raw, last_message_preview, preview_direction, unread_visible, unread_count,
             seen_state, color_hint, detected_label, ocr_confidence, captured_at, reconciliation_state,
             reconciliation_reason, work_bucket, stage_inference, stage_confidence)
          SELECT gen_random_uuid(), shot_id, batch_uuid, accounts[a], r, l.wa_name, l.phone, l.phone, l.id,
                 to_char(ts, 'HH12:MI am'), coalesce(l.last_wa_message, 'Hi, is the room available?'),
                 CASE WHEN random() < 0.6 THEN 'incoming' ELSE 'outgoing' END,
                 random() < 0.35, CASE WHEN random() < 0.35 THEN 1 + floor(random()*3)::int ELSE 0 END,
                 CASE WHEN random() < 0.35 THEN 'unseen' ELSE 'seen' END,
                 l.wa_label_colour, l.wa_label_name,
                 62 + floor(random()*38)::int, ts,
                 CASE WHEN r <= res THEN (CASE WHEN random() < 0.25 THEN 'new_customer' ELSE 'matched_existing' END)
                      WHEN r <= res + rev THEN 'needs_review' ELSE 'non_customer' END,
                 CASE WHEN r > res AND r <= res + rev THEN
                        (ARRAY['low OCR confidence','number unclear','name only','possible duplicate','group chat','existing lead uncertain'])[1 + floor(random()*6)::int]
                      ELSE NULL END,
                 l.conversation_bucket, l.pipeline_stage, 50 + floor(random()*50)::int
          FROM public.leads l WHERE l.id = lead_ids[li]
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  FOR o IN 1..array_length(ops,1) LOOP
    FOR r IN 1..4 LOOP
      ts := date_trunc('day', now()) + ((6 + r*3) || ' hours')::interval;
      IF ts > now() + interval '2 hours' THEN CONTINUE; END IF;
      b_id := gen_random_uuid();
      INSERT INTO public.flow_draft_batches (id, operator_id, operator_name, target_size, active_tray_size, status, created_at, closed_at)
      VALUES (b_id, op_ids[o], ops[o], 30, 13,
              CASE WHEN ts < now() - interval '3 hours' THEN 'completed' ELSE 'open' END, ts,
              CASE WHEN ts < now() - interval '3 hours' THEN ts + interval '2 hours' ELSE NULL END);

      INSERT INTO public.flow_draft_items
        (id, batch_id, lead_id, position, roi_score, roi_reasons, state, disposition, completed_at, created_at)
      SELECT gen_random_uuid(), b_id, s.id, s.rn,
             45 + floor(random()*55)::int,
             ARRAY[(ARRAY['unread reply waiting','qualified but no tour','post-tour positive','quotation overdue','fresh strong lead','recovery attempt'])[1 + floor(random()*6)::int]],
             CASE WHEN random() < 0.55 THEN 'done' WHEN random() < 0.75 THEN 'active' ELSE 'drafted' END,
             CASE WHEN random() < 0.55 THEN (ARRAY['called','no-answer','qualified','tour-scheduled','quote-sent','future-dated','lost'])[1 + floor(random()*7)::int] ELSE NULL END,
             CASE WHEN random() < 0.55 THEN ts + interval '90 minutes' ELSE NULL END,
             ts
      FROM (
        SELECT id, (row_number() OVER ())::int AS rn
        FROM public.leads
        ORDER BY md5(id::text || b_id::text)
        LIMIT 30
      ) s
      ON CONFLICT DO NOTHING;

      UPDATE public.leads l
         SET current_handler_name = ops[o],
             last_operator_action_at = now() - (floor(random()*300) || ' minutes')::interval
       WHERE l.id IN (SELECT lead_id FROM public.flow_draft_items WHERE batch_id = b_id AND state = 'active');
    END LOOP;
  END LOOP;

  INSERT INTO public.audit_logs (id, entity, entity_id, action, prev, next, reason, at)
  SELECT gen_random_uuid(), 'lead', id,
         (ARRAY['screenshot.uploaded','rows.extracted','customer.matched','batch.assigned','claim.activated','stage.moved','claim.released','lead.reassigned'])[1 + (rn % 8)::int],
         jsonb_build_object('stage','NEW', 'by', ops[1 + (rn % 8)::int]),
         jsonb_build_object('stage', coalesce(pipeline_stage,'DOSSIER')),
         'demo operating history', now() - (rn || ' minutes')::interval
  FROM (SELECT id, pipeline_stage, (row_number() OVER ())::int AS rn FROM public.leads LIMIT 120) s;
END $$;