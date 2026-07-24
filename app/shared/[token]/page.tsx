import SharedCollection from "@/components/SharedCollection";

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedCollection token={token} />;
}
