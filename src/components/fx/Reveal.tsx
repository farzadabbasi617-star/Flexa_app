"use client";

import { PropsWithChildren } from "react";
import { motion, Variants } from "framer-motion";

interface RevealProps {
  className?: string;
  /** Delay in seconds before the animation starts */
  delay?: number;
  /** Direction the element travels in from */
  from?: "up" | "down" | "left" | "right" | "scale";
  /** Distance (px) traveled for directional reveals */
  distance?: number;
  /** Re-trigger every time it scrolls into view (default: only once) */
  repeat?: boolean;
  /** How much of the element must be visible before triggering (0..1) */
  amount?: number;
  as?: "div" | "section" | "article" | "li";
}

const directions: Record<string, (d: number) => Variants> = {
  up: (d) => ({ hidden: { opacity: 0, y: d }, visible: { opacity: 1, y: 0 } }),
  down: (d) => ({ hidden: { opacity: 0, y: -d }, visible: { opacity: 1, y: 0 } }),
  left: (d) => ({ hidden: { opacity: 0, x: d }, visible: { opacity: 1, x: 0 } }),
  right: (d) => ({ hidden: { opacity: 0, x: -d }, visible: { opacity: 1, x: 0 } }),
  scale: () => ({ hidden: { opacity: 0, scale: 0.88 }, visible: { opacity: 1, scale: 1 } }),
};

/**
 * Scroll-triggered fade/slide reveal used to bring sections & cards to life
 * as the user scrolls — the animated equivalent of the site's luxury
 * glassmorphism cards "arriving" into place.
 */
const motionTags = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  li: motion.li,
};

export default function Reveal({
  children,
  className = "",
  delay = 0,
  from = "up",
  distance = 28,
  repeat = false,
  amount = 0.25,
  as = "div",
}: PropsWithChildren<RevealProps>) {
  const variants = directions[from](distance);
  const MotionTag = motionTags[as];

  return (
    <MotionTag
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !repeat, amount }}
      variants={variants}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
