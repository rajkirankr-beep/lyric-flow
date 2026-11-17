export type LyricWord = { word: string; start: number; end: number };

export type LyricLine = {
  start: number;
  end: number;
  text: string;
  words?: LyricWord[];
};

export type LyricsFile = {
  title: string;
  artist: string;
  duration: number;
  hookStart: number;
  lines: LyricLine[];
};

export type LyricFlowProps = {
  /** Folder name under public/songs/ */
  song: string;
  width: number;
  height: number;
  /** Injected by calculateMetadata from lyrics.json */
  lyrics?: LyricsFile;
};
