import React, { useState } from "react";
import {
  HERO_AVATAR,
  HERO_EMOJI_AVATAR,
  avatarFor,
  emojiAvatarFor,
} from "../services/avatars";

export interface AvatarProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  name?: string;
  isHuman?: boolean;
  src?: string;
  fallbackSrc?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  name = "",
  isHuman = false,
  src,
  fallbackSrc,
  alt = "",
  className = "",
  onError,
  ...rest
}) => {
  const primarySrc = src || (isHuman ? HERO_AVATAR : avatarFor(name));
  const secondarySrc = fallbackSrc || (isHuman ? HERO_EMOJI_AVATAR : emojiAvatarFor(name));

  // 0: try primary asset avatar, 1: try emoji fallback avatar, 2: failed both -> render emoji symbol
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const [currentPrimary, setCurrentPrimary] = useState(primarySrc);

  if (currentPrimary !== primarySrc) {
    setCurrentPrimary(primarySrc);
    setStage(0);
  }

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (stage === 0) {
      setStage(1);
    } else if (stage === 1) {
      setStage(2);
    }
    if (onError) onError(e);
  };

  if (stage === 2) {
    return (
      <span
        role="img"
        aria-label={alt || name || "avatar"}
        className={`inline-flex items-center justify-center select-none text-[1.2em] ${className}`}
      >
        {isHuman ? "👀" : "👤"}
      </span>
    );
  }

  return (
    <img
      src={stage === 0 ? primarySrc : secondarySrc}
      alt={alt}
      draggable={false}
      onError={handleError}
      className={className}
      {...rest}
    />
  );
};
