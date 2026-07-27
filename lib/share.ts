"use client";

// Handing something to a text message.
//
// The native share sheet already offers Messages among everything else, and
// where it exists it is the better door — it remembers who you talk to. But it
// is not everywhere, it cannot be relied on to put Messages first, and a
// person who wants to text a verse to their mother should not have to go
// looking for it behind a grid of apps she does not use.
//
// So: an explicit way, on the devices that have one.

/** Whether this device has a messaging app to hand. */
export function canTextMessage(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Open the device's message composer with this text already in it, and no
 * recipient — who it goes to is not this app's business to guess.
 *
 * iOS separates the body with & where everything else uses ?; getting it wrong
 * opens an empty message, which looks like the feature simply failed.
 */
export function textMessage(body: string): void {
  if (typeof navigator === "undefined") return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  window.location.href = isIOS
    ? `sms:&body=${encodeURIComponent(body)}`
    : `sms:?body=${encodeURIComponent(body)}`;
}
