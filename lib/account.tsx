"use client";

// Whether the reader is signed in, for the things that need an account.
//
// Study mode is the first of them. What it keeps — bookmarks, notes,
// collections — is filed under an account, and without one the server has
// nowhere to put it: every save waits in this device's queue for an owner
// that never comes. The bookmark is right there on the page, so nothing tells
// the reader it was never saved anywhere, and people used the app like that
// for weeks before finding out.
//
// Clerk answers the question where it is configured. A deployment without it
// has no way to sign in at all, so nothing is closed off there.

import { createContext, useContext, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";

export interface AccountState {
  /** this deployment has accounts, so some things wait for one */
  required: boolean;
  /** Clerk has answered; until then nothing is decided either way */
  known: boolean;
  signedIn: boolean;
}

const clerkEnabled = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const NO_ACCOUNTS: AccountState = { required: false, known: true, signedIn: false };
const AccountContext = createContext<AccountState>(NO_ACCOUNTS);

/** Only ever rendered inside ClerkProvider — its hook throws anywhere else. */
function ClerkAccount({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const value = useMemo(
    () => ({ required: true, known: isLoaded, signedIn: !!isSignedIn }),
    [isLoaded, isSignedIn]
  );
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  return clerkEnabled ? <ClerkAccount>{children}</ClerkAccount> : <>{children}</>;
}

export function useAccount(): AccountState {
  return useContext(AccountContext);
}

/**
 * Whether this reader is known to have no account where one is needed.
 *
 * Known, not merely absent: while Clerk is still loading, someone signed in
 * looks exactly like someone signed out, and treating them as signed out for
 * that half-second would throw them out of study mode mid-chapter.
 */
export function signInNeeded(account: AccountState): boolean {
  return account.required && account.known && !account.signedIn;
}
