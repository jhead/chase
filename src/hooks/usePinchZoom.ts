import { useEffect, useRef } from "react";
import { useWasm } from "../ctx/WasmContext";

/**
 * Attaches a two-finger pinch-to-zoom listener to the Bevy canvas.
 * On each pinch frame, sends a ZoomAtPoint command to Bevy with the
 * scale delta and viewport midpoint so zoom tracks the pinch center.
 *
 * Call once at mount in a component that lives for the NEXRAD page lifetime.
 */
export function usePinchZoom(): void {
  const { sendCommand } = useWasm();
  // Stable ref so the effect closure always has the latest sendCommand
  // without needing to re-attach listeners on every render.
  const sendRef = useRef(sendCommand);
  sendRef.current = sendCommand;

  useEffect(() => {
    const canvas = document.getElementById("radish-bevy-canvas");
    if (!canvas) return;

    let lastDist: number | null = null;

    const touchDist = (t: TouchList): number => {
      const dx = t[0].clientX - t[1].clientX;
      const dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const touchMid = (t: TouchList): { x: number; y: number } => ({
      x: (t[0].clientX + t[1].clientX) / 2,
      y: (t[0].clientY + t[1].clientY) / 2,
    });

    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        lastDist = touchDist(e.touches);
      }
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (e.touches.length !== 2) {
        lastDist = null;
        return;
      }

      // Prevent the browser's native pinch-zoom on the canvas.
      e.preventDefault();

      const d = touchDist(e.touches);
      if (lastDist !== null && lastDist > 0) {
        const scale = d / lastDist;
        // delta = 1 - 1/scale: positive = zoom in (fingers spreading).
        // Applied as: new_radius = radius * (1 - delta) = radius / scale.
        // Clamped to ±0.3 per frame to prevent jumps on finger re-contact.
        const delta = Math.max(-0.3, Math.min(0.3, (1 - 1 / scale) * 3));
        const { x, y } = touchMid(e.touches);
        sendRef.current({ type: "ZoomAtPoint", x, y, delta });
      }
      lastDist = d;
    };

    const onTouchEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) {
        lastDist = null;
      }
    };

    // On macOS, trackpad pinch arrives as a wheel event with ctrlKey=true.
    // Prevent the browser from intercepting it as a page zoom.
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) e.preventDefault();
    };

    canvas.addEventListener("touchstart", onTouchStart, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, []); // Canvas ID is stable for the page lifetime; no deps needed.
}
