DROP POLICY IF EXISTS "public read flow_draft_batches" ON public.flow_draft_batches;
CREATE POLICY "public read flow_draft_batches" ON public.flow_draft_batches FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "public read flow_draft_items" ON public.flow_draft_items;
CREATE POLICY "public read flow_draft_items" ON public.flow_draft_items FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "public read audit_logs" ON public.audit_logs;
CREATE POLICY "public read audit_logs" ON public.audit_logs FOR SELECT TO anon USING (true);
GRANT SELECT ON public.flow_draft_batches TO anon;
GRANT SELECT ON public.flow_draft_items TO anon;
GRANT SELECT ON public.audit_logs TO anon;