// Admin data, and who is allowed to see it.
//
// There are two standings, not one:
//
//   the owner    the account ids in ADMIN_USER_IDS (comma-separated), with
//                the app owner's id as the default so the dashboard works
//                without extra configuration. This cannot be granted from
//                inside the app — it is decided by the deployment, which is
//                what keeps it from being handed round by mistake.
//
//   trusted      people the owner has switched on from the dashboard. They
//                see everything the dashboard shows and can remove a
//                Gathering. They cannot grant trust, and they cannot stand
//                in another person's account: both of those stay with the
//                owner, because they are the two powers that could be used
//                to take the app away from the person who owns it.
//
// Every admin route must ask isTrusted() (or isOwner(), where the stricter
// answer is the right one) before returning anything.

import { nanoid } from "nanoid";
import { db, keys } from "@/lib/db";
import { impersonationEnabled } from "@/lib/impersonate";

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

/** Just the granted ones — the owner is not in here and cannot be removed. */
export async function trustedIds(): Promise<string[]> {
  return db().smembers(keys.trustedAdmins);
}

/** Whether this account may open the dashboard at all. */
export async function isTrusted(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  if (isOwner(userId)) return true;
  return (await trustedIds()).includes(userId);
}

/** Grant or withdraw. Owners are refused: their standing is not ours to edit. */
export async function setTrusted(
  userId: string,
  trusted: boolean
): Promise<void> {
  if (isOwner(userId)) return;
  const kv = db();
  if (trusted) await kv.sadd(keys.trustedAdmins, userId);
  else await kv.srem(keys.trustedAdmins, userId);
}

export interface Takeover {
  as: string;
  by: string;
  at: number;
}

/** A power with no record of its use is one nobody can be held to. */
export async function recordTakeover(by: string, as: string): Promise<void> {
  const at = Date.now();
  await db().zadd(
    keys.adminTakeovers,
    at,
    // the nonce is not decoration: zset members are unique by value, so two
    // entries written in the same millisecond would collapse into one
    JSON.stringify({ as, by, at, n: nanoid(6) })
  );
}

/**
 * Requests that carry someone else's authority, from somewhere else.
 *
 * Nothing else in the app has needed this, because nothing else in it has
 * been driven by a cookie — every other route is authorised by a header the
 * client had to set deliberately, which a form on another site cannot do. The
 * two routes below are the exception, so they check where they were called
 * from rather than trusting that Clerk's own cookie is same-site.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // not a browser form post; no ambient authority
  const allowed = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // a mangled value is not a permission
    }
  }
  try {
    allowed.add(new URL(req.url).origin);
  } catch {
    // unreachable for a real request
  }
  const host = req.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  return allowed.has(origin);
}

async function recentTakeovers(limit: number): Promise<Takeover[]> {
  const raw = await db().zrangebyscore(
    keys.adminTakeovers,
    0,
    Number.MAX_SAFE_INTEGER
  );
  const out: Takeover[] = [];
  for (const row of raw) {
    try {
      const entry = JSON.parse(row) as Takeover;
      if (entry?.as && entry?.by) out.push(entry);
    } catch {
      // a row we can't read is a row we don't show
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, limit);
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
  /** switched on by the owner; the owner's own row reads true and is fixed */
  trusted: boolean;
}

export interface AdminSummary {
  /** who is looking, so the view can withhold what only the owner may do */
  viewerId: string;
  viewerIsOwner: boolean;
  /** whether standing in an account is possible at all in this deployment */
  takeoverAvailable: boolean;
  /** owners only: the record of who stood in whom */
  takeovers: (Takeover & { asName: string; byName: string })[];
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

export async function buildSummary(viewerId: string): Promise<AdminSummary> {
  const kv = db();
  const viewerIsOwner = isOwner(viewerId);
  const trusted = new Set(await trustedIds());
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
        // Somebody's email and phone number are theirs, not the app's, and a
        // trusted admin was given the dashboard to keep an eye on Gatherings
        // rather than to collect the congregation's contact details. The
        // counts, the names and the activity are all still here; the two
        // fields nobody needs in order to moderate are not.
        email: viewerIsOwner ? clerk?.email : undefined,
        phone: viewerIsOwner ? profile.phone || undefined : undefined,
        createdAt: clerk?.createdAt,
        lastSignInAt: clerk?.lastSignInAt,
        smsReminders: profile.smsReminders === "1",
        guest: !userId.startsWith("user_"),
        trusted: isOwner(userId) || trusted.has(userId),
        ...counts,
      };
    })
  );
  users.sort((a, b) => (b.lastSignInAt ?? 0) - (a.lastSignInAt ?? 0));

  // Names for the log, so it reads as people rather than as identifiers.
  const nameOf = new Map(users.map((u) => [u.userId, u.displayName]));
  const takeovers = viewerIsOwner
    ? (await recentTakeovers(20)).map((entry) => ({
        ...entry,
        asName: nameOf.get(entry.as) ?? entry.as,
        byName: nameOf.get(entry.by) ?? entry.by,
      }))
    : [];

  return {
    viewerId,
    viewerIsOwner,
    takeoverAvailable: impersonationEnabled(),
    takeovers,
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
