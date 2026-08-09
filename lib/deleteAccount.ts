// Erasing an account, and everything of the person in it.
//
// Both app stores require this and will not list an app without it, but that
// is not really why it reads the way it does. Somebody asking to be deleted
// is asking for something specific and slightly frightening — that the record
// of them here stops existing — and a delete that quietly leaves their prayer
// requests on a wall, or their name against a verse in somebody's Gathering,
// has not done what they asked. So the rule this file follows is:
//
//   Everything they wrote, and everything about them, goes.
//   The rooms they were in stay, without them in them.
//
// A Gathering is the one thing that is not theirs to take. It has other
// people in it — their sessions, their discussions, their prayer list — and
// one member leaving, even the one who started it, is not a reason to close
// a room that other people are still meeting in. A founded Gathering is
// handed to somebody else still in it; only one with nobody left goes.
//
// The sweep is exhaustive rather than clever. It walks every Gathering in the
// app rather than only the ones the account currently belongs to, because
// somebody who left a Gathering last year still has a prayer on its list and
// a name on its wall, and their membership record is no longer there to lead
// us to it. Account deletion happens once per account, so the cost of being
// thorough is paid once and is the right cost to pay.

import { db, keys } from "@/lib/db";
import { deleteChurch } from "@/lib/churches";
import { unpublishPlan } from "@/lib/customPlans";
import { convIdFor } from "@/lib/messages";

/** Books are 1..66; notes are keyed per book, so there are 66 keys to clear. */
const BOOK_COUNT = 66;

export interface Erasure {
  /** Gatherings closed because the account was the only one left in them */
  gatheringsClosed: number;
  /** Gatherings handed on to another member */
  gatheringsHandedOn: number;
  prayersRemoved: number;
  postsRemoved: number;
  wallVersesRemoved: number;
  conversationsRemoved: number;
}

/**
 * Take an account out of one Gathering.
 *
 * Returns what happened to the Gathering itself, because the caller counts it
 * and because "the room closed" and "the room carried on" are different
 * things to be able to tell somebody afterwards.
 */
async function leaveAndScrub(
  churchId: string,
  userId: string,
  tally: Erasure
): Promise<void> {
  const kv = db();
  const members = (await kv.hgetall(keys.churchMembers(churchId))) ?? {};
  const wasMember = userId in members;
  const wasFounder = members[userId] === "founder";
  const others = Object.keys(members).filter((id) => id !== userId);

  /*
   * A room with nobody left in it goes; a room with somebody left carries on.
   *
   * When the founder is the one leaving, the room needs a new one — an
   * unfounded Gathering has nobody who can moderate it, invite to it, or
   * close it, and would sit there unowned for ever. There is no record of who
   * joined when, so the choice is made by sorting the remaining ids: not
   * seniority, but stable, so the same delete always picks the same person.
   */
  if (wasMember && others.length === 0) {
    await deleteChurch(churchId);
    tally.gatheringsClosed++;
    return;
  }
  if (wasFounder) {
    const heir = others.sort()[0];
    await kv.hset(keys.churchMembers(churchId), { [heir]: "founder" });
    await kv.hset(keys.church(churchId), { founderId: heir });
    tally.gatheringsHandedOn++;
  }
  if (wasMember) {
    await kv.hdel(keys.churchMembers(churchId), userId);
  }
  // a request to join that will never now be answered
  await kv.hdel(keys.churchRequests(churchId), userId);

  // ---- verses they hung on this wall ------------------------------------
  const wall = (await kv.hgetall(keys.churchWall(churchId))) ?? {};
  for (const [ref, value] of Object.entries(wall)) {
    try {
      if ((JSON.parse(value) as { by?: string }).by !== userId) continue;
    } catch {
      continue; // unreadable, and so not attributable to anybody
    }
    await kv.hdel(keys.churchWall(churchId), ref);
    tally.wallVersesRemoved++;
  }

  // ---- prayers they asked, and prayers they prayed for -------------------
  const prayerIds = await kv.zrangebyscore(
    keys.churchPrayers(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const prayerId of prayerIds) {
    const raw = await kv.hgetall(keys.prayer(prayerId));
    if (raw?.from === userId) {
      await kv.zrem(keys.churchPrayers(churchId), prayerId);
      await kv.del(keys.prayerPrayed(prayerId));
      await kv.del(keys.prayer(prayerId));
      tally.prayersRemoved++;
      continue;
    }
    // somebody else's request that this person had prayed for: the request
    // stays, the record that it was them who prayed does not
    await kv.srem(keys.prayerPrayed(prayerId), userId);
  }

  // ---- what they wrote in the discussions --------------------------------
  const threadIds = await kv.zrangebyscore(
    keys.churchThreads(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const threadId of threadIds) {
    const meta = await kv.hgetall(keys.thread(threadId));
    const posts = await kv.zrangebyscore(
      keys.threadPosts(threadId),
      0,
      Number.MAX_SAFE_INTEGER
    );
    let removedHere = 0;
    for (const item of posts) {
      try {
        if ((JSON.parse(item) as { from?: string }).from !== userId) continue;
      } catch {
        continue;
      }
      await kv.zrem(keys.threadPosts(threadId), item);
      removedHere++;
    }
    if (removedHere === 0) continue;
    tally.postsRemoved += removedHere;

    /*
     * A discussion whose opening post was theirs, and which nobody else ever
     * answered, was only ever them talking — it goes with them. One other
     * people joined stays, and is rebuilt around the hole: the reply count
     * and the preview both come from what is actually left.
     */
    const left = (
      await kv.zrangebyscore(keys.threadPosts(threadId), 0, Number.MAX_SAFE_INTEGER)
    )
      .map((r) => {
        try {
          return JSON.parse(r) as { text?: string; ts?: number };
        } catch {
          return null;
        }
      })
      .filter((p): p is { text?: string; ts?: number } => p !== null)
      .sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

    if (left.length === 0 && meta?.createdBy === userId) {
      await kv.zrem(keys.churchThreads(churchId), threadId);
      await kv.del(keys.threadPosts(threadId));
      await kv.del(keys.thread(threadId));
      continue;
    }
    const last = left[left.length - 1];
    await kv.hset(keys.thread(threadId), {
      replies: Math.max(left.length - 1, 0),
      lastText: last?.text?.slice(0, 120) ?? "",
      ...(last?.ts ? { lastAt: last.ts } : {}),
      // a discussion started by somebody who no longer exists still needs a
      // name against it, and the room is the honest answer
      ...(meta?.createdBy === userId
        ? { createdBy: "", createdByName: "A former member" }
        : {}),
    });
  }

  // ---- sessions: their RSVPs, and anything they scheduled -----------------
  const eventIds = await kv.zrangebyscore(
    keys.churchEvents(churchId),
    0,
    Number.MAX_SAFE_INTEGER
  );
  for (const eventId of eventIds) {
    await kv.hdel(keys.eventRsvps(eventId), userId);
    const event = await kv.hgetall(keys.event(eventId));
    // A session belongs to the people meeting at it, not to whoever typed it
    // in — cancelling a Wednesday study because one person left would be the
    // app deciding a room's calendar for it. The name comes off; the meeting
    // stands.
    if (event?.createdBy === userId) {
      await kv.hset(keys.event(eventId), { createdBy: "" });
    }
  }
}

/**
 * Erase an account.
 *
 * Returns a tally, so the person can be told what actually happened rather
 * than "done".
 */
export async function deleteAccount(userId: string): Promise<Erasure> {
  const kv = db();
  const tally: Erasure = {
    gatheringsClosed: 0,
    gatheringsHandedOn: 0,
    prayersRemoved: 0,
    postsRemoved: 0,
    wallVersesRemoved: 0,
    conversationsRemoved: 0,
  };

  // ---- anything of theirs that was published -----------------------------
  // Done first: these are the only pieces reachable by somebody who is not
  // signed in at all, so they are the ones that most need to stop resolving.
  const collections = (await kv.hgetall(keys.userCollections(userId))) ?? {};
  for (const value of Object.values(collections)) {
    try {
      const token = (JSON.parse(value) as { share?: string }).share;
      if (token) await kv.del(keys.sharedCollection(token));
    } catch {
      // unreadable row: nothing published we can find from here
    }
  }
  const customPlans = (await kv.hgetall(keys.userCustomPlans(userId))) ?? {};
  for (const value of Object.values(customPlans)) {
    try {
      const token = (JSON.parse(value) as { share?: string }).share;
      if (token) await unpublishPlan(token);
    } catch {
      // as above
    }
  }

  // ---- conversations -----------------------------------------------------
  /*
   * A direct message has two people in it and no meaning with one. Both sides
   * go: the messages, the reactions on them, this person's inbox row and the
   * other person's. Leaving the peer their half would leave a thread of
   * answers to somebody who has asked to stop existing here.
   */
  const convs = (await kv.hgetall(keys.userConvs(userId))) ?? {};
  for (const field of Object.keys(convs)) {
    if (field.includes("#")) continue; // an unread counter, not a conversation
    let peerId = "";
    try {
      peerId = (JSON.parse(convs[field]) as { peerId?: string }).peerId ?? "";
    } catch {
      // fall back to the id itself, which is the two user ids joined
      peerId = field.split("~").find((id) => id !== userId) ?? "";
    }
    await kv.del(keys.convMessages(field));
    await kv.del(keys.convReactions(field));
    if (peerId) {
      const convId = convIdFor(userId, peerId);
      await kv.hdel(keys.userConvs(peerId), convId);
      await kv.hdel(keys.userConvs(peerId), `${convId}#unread`);
      await kv.hdel(keys.user(peerId), `cleared:${convId}`);
    }
    tally.conversationsRemoved++;
  }

  // ---- every Gathering in the app ----------------------------------------
  // Not just the ones they are still in: see the note at the top of the file.
  for (const churchId of await kv.smembers(keys.allChurches)) {
    await leaveAndScrub(churchId, userId, tally);
  }

  // ---- the keys that are theirs alone ------------------------------------
  const own = [
    keys.userChurches(userId),
    keys.userPlans(userId),
    keys.userPushSubs(userId),
    keys.userBookmarks(userId),
    keys.userCollections(userId),
    keys.userSeeds(userId),
    keys.userCustomPlans(userId),
    keys.userConvs(userId),
    keys.userNotifs(userId),
    keys.userWall(userId),
    keys.prayerRate(userId),
    keys.messageRate(userId),
    keys.inviteRate(userId),
    keys.churchRate(userId),
  ];
  for (const key of own) await kv.del(key);
  for (let book = 1; book <= BOOK_COUNT; book++) {
    await kv.del(keys.userNotes(userId, book));
  }

  // ---- the lists they appear in ------------------------------------------
  await kv.hdel(keys.directory, userId);
  await kv.srem(keys.planUsers, userId);
  await kv.srem(keys.trustedAdmins, userId);
  await kv.srem(keys.deactivatedUsers, userId);

  // ---- and the profile itself, last --------------------------------------
  // Last on purpose: while it exists, a sweep that failed part way through is
  // still an account somebody can sign into and delete again. Removing it
  // first would leave the rest orphaned with no way back to it.
  await kv.del(keys.user(userId));

  return tally;
}
