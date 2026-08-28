CREATE POLICY "staff read shop docs" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'shop-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "staff upload shop docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'shop-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "staff update shop docs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'shop-documents' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'shop-documents' AND public.is_staff(auth.uid()));
CREATE POLICY "staff delete shop docs" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'shop-documents' AND public.is_staff(auth.uid()));