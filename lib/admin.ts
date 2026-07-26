// Owner-only admin data. Access is restricted to the account ids in
// ADMIN_USER_IDS (comma-separated); the app owner's id is the default so
// the dashboard works without extra configuration. Every admin route must
// call isOwner() before returning anything.

import { db, keys } from "@/lib/db";

const DEFAULT_OWNERS = ["user_3GNx7nrvGoTT4MowltjVNjsttb2"];

function owners(): string[] {
  const configured = process.env.ADMIN_USER_IDS?.trim();
  if (!configured) return DEFAULT_OWNERS;
  return configured
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isOwner(userId: string | null): boolean {
  return !!userId && owners().includes(userId);
}

export interface AdminGathering {
  id: string;
  name: string;
  description: string;
  visibility: string;
  createdAt: number;
  memberCount: number;
  adminName: string;
  threadCount: number;
  eventCount: number;
  members: { userId: string; displayName: string; role: string }[];
}

export interface AdminUser {
  userId: string;
  displayName: string;
  email?: string;
  createdAt?: number;
  lastSignInAt?: number;
  phone?: string;
  smsReminders: boolean;
  gatherings: number;
  bookmarks: number;
  pushDevices: number;
  guest: boolean;
}

export interface AdminSummary {
  totals: {
    users: number;
    clerkUsers: number;
    guests: number;
    gatherings: number;
    publicGatherings: number;
    privateGatherings: number;
    members: number;
    events: number;
    threads: number;
    pushDevices: number;
  };
  gatherings: AdminGathering[];
  users: AdminUser[];
}

async function countFor(userId: string) {
  const kv = db();
  const [churches, bookmarks, push] = await Promise.all([
    kv.smembers(keys.userChurches(userId)),
    kv.hgetall(keys.userBookmarks(userId)),
    kv.hgetall(keys.userPushSubs(userId)),
  ]);
  return {
    gatherings: churches.length,
    bookmarks: Object.keys(bookmarks ?? {}).length,
    pushDevices: Object.keys(push ?? {}).length,
  };
}

export async function buildSummary(): Promise<AdminSummary> {
  const kv = db();
  const churchIds = await kv.smembers(keys.allChurches);

  const gatherings: AdminGathering[] = [];
  const seenUsers = new Set<string>();
  let members = 0;
  let events = 0;
  let threads = 0;

  for (const churchId of churchIds) {
    const raw = await kv.hgetall(keys.church(churchId));
    if (!raw?.name) continue;
    const memberMap = (await kv.hgetall(keys.churchMembers(churchId))) ?? {};
    const memberIds = Object.keys(memberMap);
    memberIds.forEach((id) => seenUsers.add(id));
    members += memberIds.length;

    const [churchEvents, churchThreads] = await Promise.all([
      kv.zrangebyscore(keys.churchEvents(churchId), 0, Number.MAX_SAFE_INTEGER),
      kv.zrangebyscore(keys.churchThreads(churchId), 0, Number.MAX_SAFE_INTEGER),
    ]);
    events += churchEvents.length;
    threads += churchThreads.length;

    const memberDetails = await Promise.all(
      memberIds.map(async (id) => {
        const profile = await kv.hgetall(keys.user(id));
        return {
          userId: id,
          displayName: profile?.displayName ?? "Believer",
          role: memberMap[id] === "founder" ? "admin" : "member",
        };
      })
    );

    gatherings.push({
      id: churchId,
      name: raw.name,
      description: raw.description ?? "",
      visibility: raw.visibility === "private" ? "private" : "public",
      createdAt: Number(raw.createdAt) || 0,
      memberCount: memberIds.length,
      adminName:
        memberDetails.find((m) => m.role === "admin")?.displayName ?? "—",
      threadCount: churchThreads.length,
      eventCount: churchEvents.length,
      members: memberDetails,
    });
  }
  gatherings.sort((a, b) => b.createdAt - a.createdAt);

  // Clerk accounts, when configured — these carry email and sign-in data
  const clerkProfiles = new Map<
    string,
    { email?: string; createdAt?: number; lastSignInAt?: number; name?: string }
  >();
  let clerkCount = 0;
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    try {
      const { clerkClient } = await import("@clerk/nextjs/server");
      const client = await clerkClient();
      const list = await client.users.getUserList({ limit: 200 });
      clerkCount = list.totalCount ?? list.data.length;
      for (const user of list.data) {
        clerkProfiles.set(user.id, {
          email: user.primaryEmailAddress?.emailAddress,
          createdAt: user.createdAt,
          lastSignInAt: user.lastSignInAt ?? undefined,
          name: user.fullName || user.firstName || undefined,
        });
        seenUsers.add(user.id);
      }
    } catch {
      // Clerk unavailable — fall back to app-side data only
    }
  }

  const users: AdminUser[] = await Promise.all(
    [...seenUsers].map(async (userId) => {
      const profile = (await kv.hgetall(keys.user(userId))) ?? {};
      const counts = await countFor(userId);
      const clerk = clerkProfiles.get(userId);
      return {
        userId,
        displayName: profile.displayName || clerk?.name || "Believer",
        email: clerk?.email,
        createdAt: clerk?.createdAt,
        lastSignInAt: clerk?.lastSignInAt,
        phone: profile.phone || undefined,
        smsReminders: profile.smsReminders === "1",
        guest: !userId.startsWith("user_"),
        ...counts,
      };
    })
  );
  users.sort((a, b) => (b.lastSignInAt ?? 0) - (a.lastSignInAt ?? 0));

  return {
    totals: {
      users: users.length,
      clerkUsers: clerkCount || users.filter((u) => !u.guest).length,
      guests: users.filter((u) => u.guest).length,
      gatherings: gatherings.length,
      publicGatherings: gatherings.filter((f) => f.visibility === "public")
        .length,
      privateGatherings: gatherings.filter((f) => f.visibility === "private")
        .length,
      members,
      events,
      threads,
      pushDevices: users.reduce((sum, u) => sum + u.pushDevices, 0),
    },
    gatherings,
    users,
  };
}
