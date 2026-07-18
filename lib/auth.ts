// Auth abstraction: real Clerk sessions when keys are configured, otherwise a
// guest identity supplied by the client (x-guest-id header, generated once and
// kept in localStorage). API routes never need to know which mode is active.

const clerkEnabled = () => !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export async function getUserId(req: Request): Promise<string | null> {
  if (clerkEnabled()) {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    return userId;
  }
  const guestId = req.headers.get("x-guest-id");
  return guestId && /^[\w-]{8,64}$/.test(guestId) ? `guest_${guestId}` : null;
}

/** Best display name available: Clerk profile, else the name the client sent. */
export async function getDisplayName(
  req: Request,
  bodyName?: string
): Promise<string> {
  if (clerkEnabled()) {
    const { currentUser } = await import("@clerk/nextjs/server");
    const user = await currentUser();
    const name =
      user?.fullName ||
      user?.firstName ||
      user?.primaryEmailAddress?.emailAddress;
    if (name) return name;
  }
  const trimmed = bodyName?.trim();
  return trimmed ? trimmed.slice(0, 60) : "Believer";
}
