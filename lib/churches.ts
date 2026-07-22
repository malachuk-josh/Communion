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
    createdAt: Date.now(),
  };
  const kv = db();
  await kv.hset(keys.church(church.id), {
    name: church.name,
    description: church.description,
    founderId: church.founderId,
    createdAt: church.createdAt,
  });
  await kv.hset(keys.churchMembers(church.id), { [userId]: "founder" });
  await kv.sadd(keys.userChurches(userId), church.id);
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

export async function listUserChurches(userId: string): Promise<Church[]> {
  const ids = await db().smembers(keys.userChurches(userId));
  const churches = await Promise.all(ids.map((id) => getChurch(id)));
  return churches
    .filter((c): c is Church => c !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
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
  userId: string
): Promise<ChurchDetail | null> {
  const role = await getRole(churchId, userId);
  if (!role) return null;
  const church = await getChurch(churchId);
  if (!church) return null;
  const [members, events] = await Promise.all([
    getMembers(churchId),
    getUpcomingEvents(churchId),
  ]);
  return { ...church, members, events, myRole: role };
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
  patch: { name?: string; description?: string }
): Promise<boolean> {
  const role = await getRole(churchId, userId);
  if (role !== "founder") return false;
  const updates: Record<string, string> = {};
  const name = patch.name?.trim();
  if (name) updates.name = name.slice(0, 80);
  if (patch.description !== undefined) {
    updates.description = patch.description.trim().slice(0, 300);
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
