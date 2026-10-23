import { PublicCenterPage } from "@/components/app-shell/public/public-pages";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicCenterPage id={id} />;
}
