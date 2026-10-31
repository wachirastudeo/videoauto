import { getDb } from '@/lib/db';
import { notFound } from 'next/navigation';
import ProductWorkspace from '@/components/ProductWorkspace';
export const dynamic = 'force-dynamic';
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = getDb().prepare('SELECT id, name, image_url, price, folder_path FROM showcase_products WHERE id = ?').get(id) as { id: string; name: string; image_url: string; price: number; folder_path: string } | undefined;
  if (!product) notFound();
  // SQLite rows have a null prototype; client props must be plain objects.
  return <ProductWorkspace product={{ ...product }} />;
}
