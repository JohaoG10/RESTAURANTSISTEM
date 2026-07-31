-- Bucket público para imágenes de platos del menú
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu-images',
  'menu-images',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY menu_images_public_read
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'menu-images');

CREATE POLICY menu_images_authenticated_upload
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-images');

CREATE POLICY menu_images_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-images');

CREATE POLICY menu_images_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-images');
