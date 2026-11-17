import React from "react";
import { Composition, staticFile } from "remotion";
import { LyricFlow } from "./LyricFlow";
import type { LyricFlowProps, LyricsFile } from "./types";

const FPS = 30;

/** Handy presets. Pass any of these as --props='{"song":"x","width":1080,"height":1080}' */
export const RESOLUTIONS = {
  vertical: { width: 1080, height: 1920 }, // Reels / Shorts / TikTok
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
} as const;

const defaultProps: LyricFlowProps = {
  song: "my_song",
  ...RESOLUTIONS.vertical,
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="LyricFlow"
      component={LyricFlow}
      fps={FPS}
      width={defaultProps.width}
      height={defaultProps.height}
      durationInFrames={FPS * 23}
      defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => {
        const res = await fetch(staticFile(`songs/${props.song}/lyrics.json`));
        const lyrics = (await res.json()) as LyricsFile;
        return {
          durationInFrames: Math.max(1, Math.ceil(lyrics.duration * FPS)),
          width: props.width,
          height: props.height,
          props: { ...props, lyrics },
        };
      }}
    />
  );
};
