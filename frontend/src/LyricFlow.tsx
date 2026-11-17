import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { LyricFlowProps } from "./types";

const SCROLL_SECONDS = 0.45; // how long a line takes to slide into place
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

export const LyricFlow: React.FC<LyricFlowProps> = ({ song, lyrics }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const base = `songs/${song}`;
  const cover = staticFile(`${base}/cover.jpg`);
  const lines = lyrics?.lines ?? [];

  const landscape = width > height * 1.2;
  const unit = Math.min(width, height);

  // ---- Layout -------------------------------------------------------------
  const cardSize = landscape ? height * 0.52 : Math.min(width * 0.58, height * 0.3);
  const cardX = landscape ? width * 0.08 : (width - cardSize) / 2;
  const cardY = landscape ? (height - cardSize) / 2 - height * 0.04 : height * 0.09;

  const lyricsLeft = landscape ? cardX + cardSize + width * 0.06 : width * 0.09;
  const lyricsWidth = landscape ? width - lyricsLeft - width * 0.07 : width * 0.82;
  const lyricsTop = landscape ? 0 : cardY + cardSize + height * 0.04;
  const lyricsBottom = landscape ? height : height - height * 0.05;
  const centerY = (lyricsTop + lyricsBottom) / 2;

  const fontSize = landscape ? unit * 0.062 : unit * 0.066;
  const lineHeight = 1.15;
  const slot = fontSize * lineHeight * 2.25; // room for two wrapped lines

  // ---- Scroll position ----------------------------------------------------
  // Each line contributes one eased step as its start time passes, so the sum
  // stays continuous even when lines are close together.
  let pos = -1;
  for (const l of lines) {
    const p = interpolate(t, [l.start, l.start + SCROLL_SECONDS], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
    pos += p;
  }

  // ---- Card entrance ------------------------------------------------------
  const enter = spring({ frame, fps, config: { damping: 18, stiffness: 90 } });
  const cardScale = interpolate(enter, [0, 1], [0.9, 1]);
  const cardOpacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: FONT, overflow: "hidden" }}>
      <Audio src={staticFile(`${base}/audio.mp3`)} />

      {/* Layer 1: ambient background */}
      <AbsoluteFill>
        <Img
          src={cover}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: "scale(1.6)",
            filter: "blur(60px) saturate(1.8)",
          }}
        />
      </AbsoluteFill>

      {/* Dark vignette for text contrast */}
      <AbsoluteFill
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.6), rgba(0,0,0,0.8))",
        }}
      />

      {/* Layer 2: album art card */}
      <div
        style={{
          position: "absolute",
          left: cardX,
          top: cardY,
          width: cardSize,
          height: cardSize,
          borderRadius: cardSize * 0.035,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)",
          transform: `scale(${cardScale})`,
          opacity: cardOpacity,
        }}
      >
        <Img src={cover} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Kinetic lyrics */}
      <div
        style={{
          position: "absolute",
          left: lyricsLeft,
          width: lyricsWidth,
          top: 0,
          height: "100%",
        }}
      >
        {lines.map((line, i) => {
          const d = i - pos; // 0 = active, >0 upcoming, <0 past
          if (d < -2.2 || d > 3.2) return null;

          const opacity = interpolate(d, [-2, -1, 0, 1, 2, 3], [0, 0.12, 1, 0.38, 0.22, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const blur = interpolate(Math.abs(d), [0, 1, 3], [0, 0, 3], {
            extrapolateRight: "clamp",
          });
          const y = centerY + d * slot - slot / 2;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                width: "100%",
                top: y,
                height: slot,
                display: "flex",
                alignItems: "center",
                opacity,
                filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize,
                  lineHeight,
                  fontWeight: 800,
                  letterSpacing: "-0.02em",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textShadow: "0 2px 18px rgba(0,0,0,0.35)",
                }}
              >
                {line.text}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
