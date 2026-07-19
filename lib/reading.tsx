"use client";

// Shares the reader's current position with the sticky nav header.

import { createContext, useContext, useState } from "react";

export interface ReadingPosition {
  bookNr: number;
  chapter: number;
}

interface ReadingContextValue {
  position: ReadingPosition | null;
  setPosition: (position: ReadingPosition) => void;
}

const ReadingContext = createContext<ReadingContextValue>({
  position: null,
  setPosition: () => {},
});

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  return (
    <ReadingContext.Provider value={{ position, setPosition }}>
      {children}
    </ReadingContext.Provider>
  );
}

export function useReading(): ReadingContextValue {
  return useContext(ReadingContext);
}
