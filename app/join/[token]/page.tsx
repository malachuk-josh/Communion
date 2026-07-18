import JoinChurch from "@/components/JoinChurch";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinChurch token={token} />;
}
