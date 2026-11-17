import React, { useEffect, useState } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { LyricFlowProps } from "./types";

const SCROLL_SECONDS = 0.5; // time a line takes to glide into place
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const FONT = `"Helvetica Neue", Helvetica, Arial, sans-serif`;

type Accent = { h: number; s: number };

/** Dominant saturated colour of the cover, found by a weighted hue histogram. */
const extractAccent = (img: HTMLImageElement): Accent => {
  const size = 40;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { h: 0, s: 0 };
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) continue;
    const s = d / (1 - Math.abs(2 * l - 1));
    if (l < 0.12 || l > 0.92 || s < 0.15) continue;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    const w = s * s * (1 - Math.abs(2 * l - 1));
    const bin = bins[Math.min(11, Math.floor(h / 30))];
    bin.w += w;
    bin.h += h * w;
    bin.s += s * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  if (best.w <= 0) return { h: 0, s: 0 }; // greyscale cover: white accent
  return { h: best.h / best.w, s: Math.max(55, Math.min(90, (best.s / best.w) * 100)) };
};

export const LyricFlow: React.FC<LyricFlowProps> = ({ song, lyrics }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;

  const base = `songs/${song}`;
  const cover = staticFile(`${base}/cover.jpg`);
  const lines = lyrics?.lines ?? [];

  // ---- Accent colour from the cover --------------------------------------
  const [accent, setAccent] = useState<Accent>({ h: 0, s: 0 });
  const [handle] = useState(() => delayRender("cover accent colour"));
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      try {
        setAccent(extractAccent(img));
      } catch {
        /* keep white accent */
      }
      continueRender(handle);
    };
    img.onerror = () => continueRender(handle);
    img.src = cover;
  }, [cover, handle]);

  const tint = (a: number, l = 62) =>
    accent.s === 0 ? `rgba(255,255,255,${a})` : `hsla(${accent.h}, ${accent.s}%, ${l}%, ${a})`;

  // ---- Layout -------------------------------------------------------------
  const portrait = height > width * 1.2;
  const landscape = width > height * 1.2;
  const unit = Math.min(width, height);

  // Portrait: cover sits in the upper middle, lyrics below it.
  // Square / landscape: cover fills the centre and the lyrics sit over it.
  const coverSize = landscape ? height * 1.05 : width * 0.98;
  const coverCy = portrait ? height * 0.31 : height / 2;
  const lyricsCy = portrait ? height * 0.69 : height / 2;
  const lyricsWidth = portrait ? width * 0.84 : landscape ? width * 0.5 : width * 0.8;
  const fontSize = unit * (portrait ? 0.072 : 0.064);
  const S = fontSize * 2.25; // distance between stacked lines

  // ---- Slow background motion --------------------------------------------
  const prog = frame / durationInFrames;
  const coverScale = 1.04 + 0.05 * prog;
  const driftX = Math.sin(frame / (fps * 6)) * unit * 0.012;
  const driftY = Math.cos(frame / (fps * 7)) * unit * 0.01;
  const ambientScale = 1.5 + 0.08 * prog;
  const pulse = 0.85 + 0.15 * Math.sin(frame / (fps * 1.6));

  // ---- Scroll position ----------------------------------------------------
  // One eased step per line as its start time passes; stays continuous even
  // when lines are close together.
  let pos = -1;
  for (const l of lines) {
    pos += interpolate(t, [l.start, l.start + SCROLL_SECONDS], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    });
  }

  const lyricsOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const endFade = interpolate(frame, [durationInFrames - 12, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
  });

  const featherX = "linear-gradient(to right, transparent 0%, #000 16%, #000 84%, transparent 100%)";
  const featherY = "linear-gradient(to bottom, transparent 0%, #000 16%, #000 84%, transparent 100%)";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: FONT, overflow: "hidden" }}>
      <Audio src={staticFile(`${base}/audio.mp3`)} />

      {/* Layer 1: ambient colour field, very blurred */}
      <AbsoluteFill>
        <Img
          src={cover}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${ambientScale})`,
            filter: "blur(70px) saturate(1.8) brightness(0.85)",
          }}
        />
      </AbsoluteFill>

      {/* Layer 2: the cover itself, lightly blurred, feathered into layer 1 */}
      <div
        style={{
          position: "absolute",
          left: width / 2 - coverSize / 2,
          top: coverCy - coverSize / 2,
          width: coverSize,
          height: coverSize,
          opacity: portrait ? 0.95 : 0.85,
          transform: `translate(${driftX}px, ${driftY}px) scale(${coverScale})`,
          WebkitMaskImage: `${featherX}, ${featherY}`,
          WebkitMaskComposite: "source-in",
          maskImage: `${featherX}, ${featherY}`,
          maskComposite: "intersect",
        }}
      >
        <Img
          src={cover}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: `blur(${portrait ? 9 : 14}px) saturate(1.25)`,
          }}
        />
      </div>

      {/* Accent glow behind the lyric stack */}
      <div
        style={{
          position: "absolute",
          left: width / 2 - width * 0.55,
          top: lyricsCy - fontSize * 4,
          width: width * 1.1,
          height: fontSize * 8,
          background: `radial-gradient(ellipse at center, ${tint(0.3, 55)}, transparent 70%)`,
          opacity: pulse,
        }}
      />

      {/* Dark vignette for text contrast */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.4) 35%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.88) 100%)",
        }}
      />
      {!portrait && (
        <AbsoluteFill
          style={{
            background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 70%)",
          }}
        />
      )}

      {/* Centered lyric stack: previous / current / next */}
      <div
        style={{
          position: "absolute",
          left: (width - lyricsWidth) / 2,
          width: lyricsWidth,
          top: 0,
          height: "100%",
          opacity: lyricsOpacity,
        }}
      >
        {lines.map((line, i) => {
          const d = i - pos; // 0 = current, -1 = previous, 1 = next
          if (d < -2.2 || d > 2.2) return null;
          const ad = Math.abs(d);

          const y = interpolate(d, [-2, -1, 0, 1, 2], [-1.9 * S, -S, 0, S, 1.9 * S], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const scale = interpolate(d, [-1, 0, 1], [0.74, 1, 0.74], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const opacity = interpolate(d, [-2, -1, 0, 1, 2], [0, 0.32, 1, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const blur = interpolate(ad, [0, 1, 2], [0, unit * 0.006, unit * 0.013], {
            extrapolateRight: "clamp",
          });
          const glow = interpolate(ad, [0, 0.6], [1, 0], { extrapolateRight: "clamp" });

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                width: "100%",
                top: lyricsCy - S / 2,
                height: S,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `translateY(${y}px) scale(${scale})`,
                transformOrigin: "center",
                opacity,
                filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              }}
            >
              <div
                style={{
                  color: "#fff",
                  fontSize,
                  lineHeight: 1.15,
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  textAlign: "center",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  textShadow: `0 0 ${fontSize * 0.6}px ${tint(0.55 * glow)}, 0 2px 20px rgba(0,0,0,0.4)`,
                }}
              >
                {line.text}
              </div>
            </div>
          );
        })}
      </div>

      {/* Thin progress line in the accent colour */}
      <div
        style={{
          position: "absolute",
          left: width * 0.15,
          width: width * 0.7,
          top: height * (portrait ? 0.92 : 0.93),
          height: Math.max(3, unit * 0.004),
          borderRadius: 4,
          background: "rgba(255,255,255,0.15)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${prog * 100}%`, height: "100%", background: tint(0.95, 65) }} />
      </div>

      {/* Film grain */}
      <AbsoluteFill style={{ opacity: 0.08, mixBlendMode: "overlay", pointerEvents: "none" }}>
        <svg width="100%" height="100%">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={frame % 6} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>

      {/* Fade to black at the very end */}
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: endFade }} />
    </AbsoluteFill>
  );
};
