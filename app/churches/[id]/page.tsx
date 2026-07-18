import ChurchHome from "@/components/ChurchHome";

export default async function ChurchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ChurchHome churchId={id} />;
}
