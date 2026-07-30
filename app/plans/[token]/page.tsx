import SharedPlan from "@/components/SharedPlan";

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedPlan token={token} />;
}
