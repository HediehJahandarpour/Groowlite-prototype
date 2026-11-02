import gsap from "gsap";
import {
  EXPLORER_MOTION,
  idleMotionFor,
  type IdleMotion,
} from "./explorerMotion";

export type IdleTarget = {
  id: string;
  rank: number;
  group: number;
  element: HTMLElement;
};

type IdleEntry = {
  element: HTMLElement;
  motion: IdleMotion;
  tween: gsap.core.Tween | null;
  visible: boolean;
  held: boolean;
  introduced: boolean;
};

export type IdleFloatController = {
  setVisible: (id: string, visible: boolean) => void;
  hold: (id: string) => void;
  release: (id: string) => void;
  suspend: () => void;
  resume: () => void;
  destroy: () => void;
};

const noop: IdleFloatController = {
  setVisible: () => {},
  hold: () => {},
  release: () => {},
  suspend: () => {},
  resume: () => {},
  destroy: () => {},
};

/**
 * Floats the inner token art. The button transform stays with the
 * depth scroller, so these tweens cannot replace a scroll pose.
 */
export function createIdleFloat(
  targets: IdleTarget[],
  reduced: boolean,
): IdleFloatController {
  if (reduced || !EXPLORER_MOTION.idle.enabled || targets.length === 0) {
    return noop;
  }

  const entries = new Map<string, IdleEntry>();
  for (const target of targets) {
    entries.set(target.id, {
      element: target.element,
      motion: idleMotionFor(target.id, target.rank, target.group),
      tween: null,
      visible: false,
      held: false,
      introduced: false,
    });
  }

  let suspended = false;

  function play(entry: IdleEntry, seek: boolean) {
    if (suspended || entry.held || !entry.visible) return;
    if (entry.tween?.isActive()) return;
    gsap.killTweensOf(entry.element);
    entry.introduced = true;
    const { motion } = entry;
    const tween = gsap.fromTo(
      entry.element,
      { x: 0, y: 0, rotationX: 0, rotationY: 0 },
      {
        x: motion.x,
        y: motion.y,
        rotationX: motion.rotationX,
        rotationY: motion.rotationY,
        duration: motion.duration,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
        force3D: true,
        immediateRender: seek,
        delay: seek ? 0 : motion.phase * EXPLORER_MOTION.idle.resumeSpread,
      },
    );
    if (seek) tween.time(motion.phase * motion.duration * 2);
    entry.tween = tween;
  }

  function rest(entry: IdleEntry, duration: number) {
    entry.tween?.kill();
    entry.tween = null;
    gsap.killTweensOf(entry.element);
    gsap.to(entry.element, {
      x: 0,
      y: 0,
      rotationX: 0,
      rotationY: 0,
      duration,
      ease: "sine.out",
      overwrite: "auto",
      force3D: true,
    });
  }

  return {
    setVisible(id, visible) {
      const entry = entries.get(id);
      if (!entry || entry.visible === visible) return;
      entry.visible = visible;
      if (visible) play(entry, !entry.introduced);
      else rest(entry, EXPLORER_MOTION.idle.settleDuration);
    },
    hold(id) {
      const entry = entries.get(id);
      if (!entry || entry.held) return;
      entry.held = true;
      rest(entry, 0.2);
    },
    release(id) {
      const entry = entries.get(id);
      if (!entry || !entry.held) return;
      entry.held = false;
      play(entry, false);
    },
    suspend() {
      if (suspended) return;
      suspended = true;
      for (const entry of entries.values()) {
        rest(entry, EXPLORER_MOTION.idle.settleDuration);
      }
    },
    resume() {
      if (!suspended) return;
      suspended = false;
      for (const entry of entries.values()) play(entry, false);
    },
    destroy() {
      suspended = true;
      for (const entry of entries.values()) {
        entry.tween?.kill();
        gsap.killTweensOf(entry.element);
        gsap.set(entry.element, { clearProps: "transform" });
      }
      entries.clear();
    },
  };
}
