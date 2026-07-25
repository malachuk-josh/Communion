"use client";

// Shares the reader's current position with the sticky nav header, and lets
// the header's passage chip open the reader's control sheet. Nav writes
// panelOpen; Reader renders the sheet and closes it again.

import { createContext, useContext, useMemo, useState } from "react";

export interface ReadingPosition {
  bookNr: number;
  chapter: number;
}

interface ReadingContextValue {
  position: ReadingPosition | null;
  setPosition: (position: ReadingPosition) => void;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ReadingContext = createContext<ReadingContextValue>({
  position: null,
  setPosition: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
});

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const value = useMemo(
    () => ({ position, setPosition, panelOpen, setPanelOpen }),
    [position, panelOpen]
  );
  return (
    <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
  );
}

export function useReading(): ReadingContextValue {
  return useContext(ReadingContext);
}
