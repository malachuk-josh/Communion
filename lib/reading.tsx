"use client";

// Shares the reader's current position with the sticky nav header, and lets
// the header drive the reader: the passage chip opens the control sheet, the
// ✦ button turns study mode on. Study mode lives here rather than in Reader
// because both the header and the reader read and write it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export interface ReadingPosition {
  bookNr: number;
  chapter: number;
}

interface ReadingContextValue {
  position: ReadingPosition | null;
  setPosition: (position: ReadingPosition) => void;
  panelOpen: boolean;
  setPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  study: boolean;
  toggleStudy: () => void;
}

const ReadingContext = createContext<ReadingContextValue>({
  position: null,
  setPosition: () => {},
  panelOpen: false,
  setPanelOpen: () => {},
  study: false,
  toggleStudy: () => {},
});

export function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [position, setPosition] = useState<ReadingPosition | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [study, setStudy] = useState(false);

  // read after mount: the server has no idea which mode this reader left in
  useEffect(() => {
    try {
      if (window.localStorage.getItem("communion.studyMode") === "1") {
        setStudy(true);
      }
    } catch {
      // storage blocked — study mode simply starts off
    }
  }, []);

  const toggleStudy = useCallback(() => {
    setStudy((on) => {
      try {
        window.localStorage.setItem("communion.studyMode", on ? "0" : "1");
      } catch {
        // storage blocked — the choice just won't outlive this visit
      }
      return !on;
    });
  }, []);

  const value = useMemo(
    () => ({ position, setPosition, panelOpen, setPanelOpen, study, toggleStudy }),
    [position, panelOpen, study, toggleStudy]
  );
  return (
    <ReadingContext.Provider value={value}>{children}</ReadingContext.Provider>
  );
}

export function useReading(): ReadingContextValue {
  return useContext(ReadingContext);
}
