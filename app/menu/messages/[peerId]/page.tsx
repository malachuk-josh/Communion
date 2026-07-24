import MessageThread from "@/components/MessageThread";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ peerId: string }>;
}) {
  const { peerId } = await params;
  return <MessageThread peerId={peerId} />;
}
