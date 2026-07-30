import { nanoid } from "nanoid";
import { db, keys } from "@/lib/db";
import type {
  Church,
  ChurchDetail,
  Member,
  Role,
  RsvpStatus,
  SessionType,
  WorshipEvent,
} from "@/lib/types";

export const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;

const SESSION_TYPES: SessionType[] = [
  "bible_study",
  "prayer",
  "communion",
  "praise_worship",
  "fellowship",
  "custom",
];

export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPES as string[]).includes(value);
}

export async function saveProfile(userId: string, displayName: string) {
  await db().hset(keys.user(userId), { displayName });
}

export async function createChurch(
  userId: string,
  name: string,
  description: string
): Promise<Church> {
  const church: Church = {
    id: nanoid(12),
    name: name.slice(0, 80),
    description: description.slice(0, 300),
    founderId: userId,
    visibility: "public",
    createdAt: Date.now(),
  };
  const kv = db();
  await kv.hset(keys.church(church.id), {
    name: church.name,
    description: church.description,
    founderId: church.founderId,
    visibility: church.visibility,
    createdAt: church.createdAt,
  });
  await kv.hset(keys.churchMembers(church.id), { [userId]: "founder" });
  await kv.sadd(keys.userChurches(userId), church.id);
  await kv.sadd(keys.allChurches, church.id);
  return church;
}

export async function getChurch(churchId: string): Promise<Church | null> {
  const raw = await db().hgetall(keys.church(churchId));
  if (!raw) return null;
  return {
    id: churchId,
    name: raw.name ?? "",
    description: raw.description ?? "",
    founderId: raw.founderId ?? "",
    visibility: raw.visibility === "private" ? "private" : "public",
    createdAt: Number(raw.createdAt ?? 0),
  };
}

export async function getRole(
  churchId: string,
  userId: string
): Promise<Role | null> {
  const members = await db().hgetall(keys.churchMembers(churchId));
  const role = members?.[userId];
  return role === "founder" || role === "member" ? role : null;
}

export async function addMember(churchId: string, userId: string) {
  const kv = db();
  const existing = await getRole(churchId, userId);
  if (!existing) {
    await kv.hset(keys.churchMembers(churchId), { [userId]: "member" });
  }
  await kv.sadd(keys.userChurches(userId), churchId);
}

export async function listUserChurches(
  userId: string
): Promise<(Church & { myRole: Role; memberCount: number })[]> {
  const kv = db();
  const ids = await kv.smembers(keys.userChurches(userId));
  const churches = await Promise.all(
    ids.map(async (id) => {
      const church = await getChurch(id);
      if (!church) return null;
      const members = (await kv.hgetall(keys.churchMembers(id))) ?? {};
      const role = members[userId];
      if (role !== "founder" && role !== "member") return null;
      return {
        ...church,
        myRole: role as Role,
        memberCount: Object.keys(members).length,
      };
    })
  );
  return churches
    .filter((c): c is Church & { myRole: Role; memberCount: number } => !!c)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Founder removes a member (never themselves, never another founder). */
export async function removeMember(
  churchId: string,
  founderId: string,
  memberId: string
): Promise<boolean> {
  const role = await getRole(churchId, founderId);
  if (role !== "founder" || memberId === founderId) return false;
  const target = await getRole(churchId, memberId);
  if (!target || target === "founder") return false;
  await db().hdel(keys.churchMembers(churchId), memberId);
  await db().srem(keys.userChurches(memberId), churchId);
  return true;
}

async function getMembers(churchId: string): Promise<Member[]> {
  const kv = db();
  const raw = (await kv.hgetall(keys.churchMembers(churchId))) ?? {};
  const members = await Promise.all(
    Object.entries(raw).map(async ([userId, role]) => {
      const profile = await kv.hgetall(keys.user(userId));
      return {
        userId,
        role: (role === "founder" ? "founder" : "member") as Role,
        displayName: profile?.displayName ?? "Believer",
      };
    })
  );
  return members.sort((a, b) => (a.role === "founder" ? -1 : b.role === "founder" ? 1 : 0));
}

async function getEvent(eventId: string): Promise<WorshipEvent | null> {
  const kv = db();
  const raw = await kv.hgetall(keys.event(eventId));
  if (!raw) return null;
  const rsvps = ((await kv.hgetall(keys.eventRsvps(eventId))) ??
    {}) as Record<string, RsvpStatus>;
  return {
    id: eventId,
    churchId: raw.churchId ?? "",
    type: isSessionType(raw.type ?? "") ? (raw.type as SessionType) : "custom",
    title: raw.title ?? "",
    startsAt: Number(raw.startsAt ?? 0),
    durationMin: Number(raw.durationMin ?? 60),
    passageRef: raw.passageRef || undefined,
    meetingUrl: raw.meetingUrl || undefined,
    details: raw.details || undefined,
    createdBy: raw.createdBy ?? "",
    createdAt: Number(raw.createdAt ?? 0),
    rsvps,
  };
}

/** Upcoming (and just-started) sessions, soonest first. */
async function getUpcomingEvents(churchId: string): Promise<WorshipEvent[]> {
  const threeHoursAgo = Date.now() - 3 * 60 * 60 * 1000;
  const ids = await db().zrangebyscore(
    keys.churchEvents(churchId),
    threeHoursAgo,
    Number.MAX_SAFE_INTEGER
  );
  const events = await Promise.all(ids.map((id) => getEvent(id)));
  return events.filter((e): e is WorshipEvent => e !== null);
}

export async function getChurchDetail(
  churchId: string,
  userId: string | null
): Promise<ChurchDetail | null> {
  const church = await getChurch(churchId);
  if (!church) return null;
  const role = userId ? await getRole(churchId, userId) : null;

  // non-member: public churches show a limited profile, private ones nothing
  if (!role) {
    if (church.visibility === "private") return null;
    const members = await getMembers(churchId);
    let requestPending = false;
    if (userId) {
      const requests = await db().hgetall(keys.churchRequests(churchId));
      requestPending = !!requests?.[userId];
    }
    return { ...church, members, events: [], myRole: null, requestPending };
  }

  const [members, events] = await Promise.all([
    getMembers(churchId),
    getUpcomingEvents(churchId),
  ]);
  const detail: ChurchDetail = { ...church, members, events, myRole: role };
  if (role === "founder") {
    const raw = (await db().hgetall(keys.churchRequests(churchId))) ?? {};
    detail.requests = await Promise.all(
      Object.entries(raw).map(async ([uid, name]) => ({
        userId: uid,
        displayName: name || "Believer",
      }))
    );
  }
  return detail;
}

/** Upcoming sessions from public churches — the community gatherings feed. */
export async function listPublicGatherings(
  limit = 20
): Promise<(WorshipEvent & { churchName: string })[]> {
  const ids = await db().smembers(keys.allChurches);
  const all: (WorshipEvent & { churchName: string })[] = [];
  for (const churchId of ids) {
    const church = await getChurch(churchId);
    if (!church || church.visibility === "private") continue;
    const events = await getUpcomingEvents(churchId);
    all.push(...events.map((e) => ({ ...e, churchName: church.name })));
  }
  return all.sort((a, b) => a.startsAt - b.startsAt).slice(0, limit);
}

/**
 * Upcoming sessions at open Gatherings the reader has NOT joined.
 *
 * The Gatherings page can show these beside their own, so that a room can be
 * found by when it meets rather than only by what it is called — "Tuesday
 * evening" is how most people decide whether they can come.
 *
 * What comes back is deliberately less than a member sees. The time, the
 * title, the passage and the room's name are an invitation, and a public
 * Gathering is one that wants to be found. The meeting link is not an
 * invitation, it is a door: handing it to somebody who has not joined lets
 * them walk into the call. The same goes for the arrangements in `details`
 * — whose house, what to bring — and for who has said they are coming. Those
 * are for the room. So the row is built field by field rather than spread
 * from the event, which means a field added to WorshipEvent later cannot
 * leak through here by default.
 */
export async function listOpenEvents(
  userId: string | null,
  limit = 40
): Promise<(WorshipEvent & { churchName: string })[]> {
  const kv = db();
  const mine = userId
    ? new Set(await kv.smembers(keys.userChurches(userId)))
    : new Set<string>();
  const ids = await kv.smembers(keys.allChurches);
  const all: (WorshipEvent & { churchName: string })[] = [];
  for (const churchId of ids) {
    // already answered by listUserEvents, and answered more fully there
    if (mine.has(churchId)) continue;
    const church = await getChurch(churchId);
    if (!church || church.visibility === "private") continue;
    for (const event of await getUpcomingEvents(churchId)) {
      all.push({
        id: event.id,
        churchId: event.churchId,
        type: event.type,
        title: event.title,
        startsAt: event.startsAt,
        durationMin: event.durationMin,
        passageRef: event.passageRef,
        createdBy: "",
        createdAt: event.createdAt,
        rsvps: {},
        churchName: church.name,
      });
    }
  }
  // Soonest first, and capped. The cap is why the toggle exists: this list
  // grows with the whole directory rather than with anything the reader did.
  return all.sort((a, b) => a.startsAt - b.startsAt).slice(0, limit);
}

/** Upcoming sessions across every church the user belongs to, soonest first. */
export async function listUserEvents(
  userId: string
): Promise<(WorshipEvent & { churchName: string })[]> {
  const kv = db();
  const churchIds = await kv.smembers(keys.userChurches(userId));
  const all: (WorshipEvent & { churchName: string })[] = [];
  const profileCache = new Map<string, { name: string }>();
  const profileOf = async (uid: string): Promise<{ name: string }> => {
    const hit = profileCache.get(uid);
    if (hit) return hit;
    const entry = {
      name: (await kv.hgetall(keys.user(uid)))?.displayName || "Believer",
    };
    profileCache.set(uid, entry);
    return entry;
  };
  for (const churchId of churchIds) {
    const church = await getChurch(churchId);
    if (!church) continue;
    const events = await getUpcomingEvents(churchId);
    for (const event of events) {
      const attendees = await Promise.all(
        Object.entries(event.rsvps).map(async ([uid, status]) => {
          const p = await profileOf(uid);
          return { name: p.name, status };
        })
      );
      all.push({ ...event, attendees, churchName: church.name });
    }
  }
  return all.sort((a, b) => a.startsAt - b.startsAt);
}

export async function listPublicChurches(
  userId: string | null
): Promise<(Church & { memberCount: number; mine: boolean })[]> {
  const kv = db();
  const ids = await kv.smembers(keys.allChurches);
  const churches = await Promise.all(
    ids.map(async (id) => {
      const church = await getChurch(id);
      if (!church || church.visibility === "private") return null;
      const members = (await kv.hgetall(keys.churchMembers(id))) ?? {};
      return {
        ...church,
        memberCount: Object.keys(members).length,
        mine: !!userId && userId in members,
      };
    })
  );
  return churches
    .filter((c): c is Church & { memberCount: number; mine: boolean } => !!c)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Join a Gathering.
 *
 * Open to all means open to all: walk in, and you are in. Asking a founder to
 * approve somebody who arrived through a directory that exists to invite them
 * was a door with a lock on a room with no walls — the founder learned nothing
 * from the request they could not learn from the member list, and the person
 * waited for it.
 *
 * Private is where approval belongs, and it is still here: nothing about a
 * private Gathering is visible to somebody outside it, so in practice they
 * arrive by invitation instead — but if one is ever reachable, it asks rather
 * than admits.
 */
export async function joinChurch(
  churchId: string,
  userId: string,
  displayName: string
): Promise<"joined" | "requested" | "member" | "not_found"> {
  const church = await getChurch(churchId);
  if (!church) return "not_found";
  const role = await getRole(churchId, userId);
  if (role) return "member";
  await saveProfile(userId, displayName);
  if (church.visibility === "private") {
    await db().hset(keys.churchRequests(churchId), { [userId]: displayName });
    return "requested";
  }
  await addMember(churchId, userId);
  return "joined";
}

export async function resolveRequest(
  churchId: string,
  founderId: string,
  requesterId: string,
  approve: boolean
): Promise<boolean> {
  const role = await getRole(churchId, founderId);
  if (role !== "founder") return false;
  const requests = await db().hgetall(keys.churchRequests(churchId));
  if (!requests?.[requesterId]) return false;
  if (approve) await addMember(churchId, requesterId);
  await db().hdel(keys.churchRequests(churchId), requesterId);
  return true;
}

export async function createInvite(
  churchId: string,
  invitedBy: string
): Promise<string> {
  const token = nanoid(24);
  const kv = db();
  await kv.hset(keys.invite(token), {
    churchId,
    invitedBy,
    createdAt: Date.now(),
  });
  await kv.expire(keys.invite(token), INVITE_TTL_SECONDS);
  return token;
}

export async function getInvite(
  token: string
): Promise<{ churchId: string; invitedBy: string } | null> {
  if (!/^[\w-]{10,40}$/.test(token)) return null;
  const raw = await db().hgetall(keys.invite(token));
  if (!raw?.churchId) return null;
  return { churchId: raw.churchId, invitedBy: raw.invitedBy ?? "" };
}

export async function createEvent(
  churchId: string,
  userId: string,
  input: {
    type: SessionType;
    title: string;
    startsAt: number;
    durationMin: number;
    passageRef?: string;
    meetingUrl?: string;
    details?: string;
  }
): Promise<WorshipEvent> {
  const kv = db();
  const event: WorshipEvent = {
    id: nanoid(12),
    churchId,
    type: input.type,
    title: input.title.slice(0, 120),
    startsAt: input.startsAt,
    durationMin: Math.min(Math.max(input.durationMin, 5), 24 * 60),
    passageRef: input.passageRef?.slice(0, 80),
    meetingUrl: input.meetingUrl?.slice(0, 300),
    details: input.details?.slice(0, 200),
    createdBy: userId,
    createdAt: Date.now(),
    rsvps: { [userId]: "going" },
  };
  await kv.hset(keys.event(event.id), {
    churchId: event.churchId,
    type: event.type,
    title: event.title,
    startsAt: event.startsAt,
    durationMin: event.durationMin,
    passageRef: event.passageRef ?? "",
    meetingUrl: event.meetingUrl ?? "",
    details: event.details ?? "",
    createdBy: event.createdBy,
    createdAt: event.createdAt,
  });
  await kv.hset(keys.eventRsvps(event.id), { [userId]: "going" });
  await kv.zadd(keys.churchEvents(churchId), event.startsAt, event.id);
  await kv.zadd(keys.allEvents, event.startsAt, event.id);
  return event;
}

/** Event plus its church name, gated on membership. */
export async function getEventForMember(
  eventId: string,
  userId: string
): Promise<{ event: WorshipEvent; churchName: string } | null> {
  const event = await getEvent(eventId);
  if (!event) return null;
  const role = await getRole(event.churchId, userId);
  if (!role) return null;
  const church = await getChurch(event.churchId);
  return { event, churchName: church?.name ?? "Church" };
}

/** Founder-only: rename the church or update its description. */
export async function updateChurch(
  churchId: string,
  userId: string,
  patch: { name?: string; description?: string; visibility?: string }
): Promise<boolean> {
  const role = await getRole(churchId, userId);
  if (role !== "founder") return false;
  const updates: Record<string, string> = {};
  const name = patch.name?.trim();
  if (name) updates.name = name.slice(0, 80);
  if (patch.description !== undefined) {
    updates.description = patch.description.trim().slice(0, 300);
  }
  if (patch.visibility === "public" || patch.visibility === "private") {
    updates.visibility = patch.visibility;
  }
  if (Object.keys(updates).length === 0) return false;
  await db().hset(keys.church(churchId), updates);
  return true;
}

/** Members may leave; the founder stays (the church would be orphaned). */
export async function leaveChurch(
  churchId: string,
  userId: string
): Promise<"left" | "founder" | "not_member"> {
  const role = await getRole(churchId, userId);
  if (!role) return "not_member";
  if (role === "founder") return "founder";
  const kv = db();
  await kv.hdel(keys.churchMembers(churchId), userId);
  await kv.srem(keys.userChurches(userId), churchId);
  return "left";
}

/** Creator or church founder may edit a session. */
export async function updateEvent(
  eventId: string,
  userId: string,
  patch: {
    type?: SessionType;
    title?: string;
    startsAt?: number;
    durationMin?: number;
    passageRef?: string;
    meetingUrl?: string;
    details?: string;
  }
): Promise<boolean> {
  const kv = db();
  const raw = await kv.hgetall(keys.event(eventId));
  if (!raw?.churchId) return false;
  const role = await getRole(raw.churchId, userId);
  const allowed = role && (raw.createdBy === userId || role === "founder");
  if (!allowed) return false;

  const updates: Record<string, string | number> = {};
  if (patch.type && isSessionType(patch.type)) updates.type = patch.type;
  const title = patch.title?.trim();
  if (title) updates.title = title.slice(0, 120);
  if (Number.isFinite(patch.startsAt)) updates.startsAt = patch.startsAt!;
  if (Number.isFinite(patch.durationMin)) {
    updates.durationMin = Math.min(Math.max(patch.durationMin!, 5), 24 * 60);
  }
  if (patch.passageRef !== undefined) {
    updates.passageRef = patch.passageRef.trim().slice(0, 80);
  }
  if (patch.meetingUrl !== undefined) {
    updates.meetingUrl = patch.meetingUrl.trim().slice(0, 300);
  }
  if (patch.details !== undefined) {
    updates.details = patch.details.trim().slice(0, 200);
  }
  if (Object.keys(updates).length === 0) return false;

  await kv.hset(keys.event(eventId), updates);
  if (updates.startsAt !== undefined) {
    const score = Number(updates.startsAt);
    await kv.zadd(keys.churchEvents(raw.churchId), score, eventId);
    await kv.zadd(keys.allEvents, score, eventId);
  }
  return true;
}

/** Creator or church founder may cancel a session. */
export async function deleteEvent(
  eventId: string,
  userId: string
): Promise<boolean> {
  const kv = db();
  const raw = await kv.hgetall(keys.event(eventId));
  if (!raw?.churchId) return false;
  const role = await getRole(raw.churchId, userId);
  const allowed = role && (raw.createdBy === userId || role === "founder");
  if (!allowed) return false;
  await kv.zrem(keys.churchEvents(raw.churchId), eventId);
  await kv.zrem(keys.allEvents, eventId);
  await kv.del(keys.event(eventId));
  await kv.del(keys.eventRsvps(eventId));
  return true;
}

export async function setRsvp(
  eventId: string,
  userId: string,
  status: RsvpStatus
): Promise<{ churchId: string } | null> {
  const kv = db();
  const raw = await kv.hgetall(keys.event(eventId));
  if (!raw?.churchId) return null;
  const role = await getRole(raw.churchId, userId);
  if (!role) return null;
  await kv.hset(keys.eventRsvps(eventId), { [userId]: status });
  return { churchId: raw.churchId };
}

/**
 * Delete a Gathering, and everything that only existed because it did.
 *
 * A Gathering is not one record. It is a hash of its own, a hash of members,
 * a sorted set of sessions, one of prayers, one of discussions — each of which
 * has a hash and a set of posts behind it — a set of pending join requests,
 * and an entry in every member's list of the Gatherings they are in, and in
 * the index Discover reads. Removing the first of those and stopping is how a
 * deleted Gathering keeps appearing on people's Gatherings screens and in
 * Discover, pointing at nothing.
 *
 * Members are read before anything is dropped, because the member hash is
 * what says whose lists have to be corrected — delete it first and there is no
 * longer any way to know.
 *
 * Invite tokens are left. They are keyed by the token rather than by the
 * Gathering, so they cannot be enumerated from here, and one that outlives its
 * Gathering resolves to nothing and reads as expired — which it is.
 */
export async function deleteChurch(churchId: string): Promise<void> {
  const kv = db();
  const members = Object.keys((await kv.hgetall(keys.churchMembers(churchId))) ?? {});

  const threadIds = await kv.zrangebyscore(
    keys.churchThreads(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const id of threadIds) {
    await kv.del(keys.threadPosts(id));
    await kv.del(keys.thread(id));
  }

  const eventIds = await kv.zrangebyscore(
    keys.churchEvents(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const id of eventIds) {
    await kv.del(keys.eventRsvps(id));
    await kv.del(keys.event(id));
  }

  // Prayers asked inside a Gathering are indexed only here — there is no
  // second list they also belong to, so once this set goes the requests
  // themselves are unreachable, and unreachable is not the same as gone.
  const prayerIds = await kv.zrangebyscore(
    keys.churchPrayers(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const id of prayerIds) {
    await kv.del(keys.prayerPrayed(id));
    await kv.del(keys.prayer(id));
  }

  // the wall goes with the room it hung in
  await kv.del(keys.churchWall(churchId));
  await kv.del(keys.churchThreads(churchId));
  await kv.del(keys.churchEvents(churchId));
  await kv.del(keys.churchPrayers(churchId));
  await kv.del(keys.churchRequests(churchId));
  await kv.del(keys.churchMembers(churchId));
  await kv.del(keys.church(churchId));

  for (const userId of members) {
    await kv.srem(keys.userChurches(userId), churchId);
  }
  await kv.srem(keys.allChurches, churchId);
}
