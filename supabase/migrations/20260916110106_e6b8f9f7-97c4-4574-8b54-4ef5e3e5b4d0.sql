GRANT SELECT ON public.screenshot_batches TO anon;
GRANT SELECT ON public.whatsapp_screenshots TO anon;

DROP POLICY IF EXISTS "public read screenshot_batches" ON public.screenshot_batches;
CREATE POLICY "public read screenshot_batches" ON public.screenshot_batches FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "public read whatsapp_screenshots" ON public.whatsapp_screenshots;
CREATE POLICY "public read whatsapp_screenshots" ON public.whatsapp_screenshots FOR SELECT TO anon USING (true);