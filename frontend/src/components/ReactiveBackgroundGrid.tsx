import React, { useEffect, useRef } from 'react';
import type { AgentPersonaId } from '../types/agent';
import { AGENT_PERSONAS } from '../types/agent';

interface ReactiveBackgroundGridProps {
  persona?: AgentPersonaId;
  clearTrigger?: number;
  onActiveCountChange?: (count: number) => void;
}

interface HighlightedBlock {
  row: number;
  col: number;
  alpha: number;
  targetAlpha: number;
}

export const ReactiveBackgroundGrid: React.FC<ReactiveBackgroundGridProps> = ({
  persona = 'jarvis',
  clearTrigger = 0,
  onActiveCountChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    intensity: number;
    targetIntensity: number;
    isInside: boolean;
  }>({
    x: -1000,
    y: -1000,
    targetX: -1000,
    targetY: -1000,
    intensity: 0,
    targetIntensity: 0,
    isInside: false,
  });

  const selectedBlocksRef = useRef<Map<string, HighlightedBlock>>(new Map());

  const personaConfig = AGENT_PERSONAS[persona] || AGENT_PERSONAS.jarvis;
  const colorRef = useRef<string>(personaConfig.color);

  useEffect(() => {
    colorRef.current = personaConfig.color;
  }, [personaConfig.color]);

  // Listen for clearTrigger to fade out all marked blocks smoothly
  useEffect(() => {
    if (clearTrigger > 0) {
      selectedBlocksRef.current.forEach((block) => {
        block.targetAlpha = 0;
      });
      onActiveCountChange?.(0);
    }
  }, [clearTrigger, onActiveCountChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let dpr = 1;

    // Grid spacing (40px exactly aligns with HUD background layout)
    const GRID_SIZE = 40;
    const INFLUENCE_RADIUS = 130; // Small, precise cursor radius
    const MAX_ELEVATION = 16; // 3D pop depth

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const isInteractiveTarget = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      return !!(
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('button') ||
        target.closest('input') ||
        target.closest('textarea') ||
        target.closest('form') ||
        target.closest('.hud-interactive') ||
        target.closest('[role="button"]') ||
        target.closest('.cursor-pointer')
      );
    };

    const applyBlockAction = (clientX: number, clientY: number, mode: 'draw' | 'erase') => {
      const col = Math.floor(clientX / GRID_SIZE);
      const row = Math.floor(clientY / GRID_SIZE);
      const key = `${row},${col}`;

      const map = selectedBlocksRef.current;
      if (mode === 'draw') {
        if (map.has(key)) {
          map.get(key)!.targetAlpha = 1;
        } else {
          map.set(key, { row, col, alpha: 0, targetAlpha: 1 });
        }
      } else if (mode === 'erase') {
        if (map.has(key)) {
          map.get(key)!.targetAlpha = 0;
        }
      }

      let activeCount = 0;
      map.forEach((b) => {
        if (b.targetAlpha > 0) activeCount++;
      });
      onActiveCountChange?.(activeCount);
    };

    let isDrawing = false;
    let drawMode: 'draw' | 'erase' = 'draw';

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Left click only
      const target = e.target as HTMLElement | null;
      if (isInteractiveTarget(target)) return;

      const col = Math.floor(e.clientX / GRID_SIZE);
      const row = Math.floor(e.clientY / GRID_SIZE);
      const key = `${row},${col}`;

      isDrawing = true;
      const isAlreadyActive = selectedBlocksRef.current.has(key) && selectedBlocksRef.current.get(key)!.targetAlpha > 0;
      drawMode = isAlreadyActive ? 'erase' : 'draw';

      applyBlockAction(e.clientX, e.clientY, drawMode);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
      mouseRef.current.targetIntensity = 1.0;
      mouseRef.current.isInside = true;

      // Hold left-click and drag across grid blocks
      if (isDrawing && (e.buttons === 1 || e.which === 1)) {
        const target = e.target as HTMLElement | null;
        if (!isInteractiveTarget(target)) {
          applyBlockAction(e.clientX, e.clientY, drawMode);
        }
      }
    };

    const handleMouseUp = () => {
      isDrawing = false;
    };

    const handleMouseLeave = () => {
      isDrawing = false;
      mouseRef.current.targetIntensity = 0;
      mouseRef.current.isInside = false;
    };

    // Touch support for mobile / tablet drag marking
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const target = e.target as HTMLElement | null;
        if (isInteractiveTarget(target)) return;

        isDrawing = true;
        mouseRef.current.targetX = touch.clientX;
        mouseRef.current.targetY = touch.clientY;
        mouseRef.current.targetIntensity = 1.0;
        mouseRef.current.isInside = true;

        const col = Math.floor(touch.clientX / GRID_SIZE);
        const row = Math.floor(touch.clientY / GRID_SIZE);
        const key = `${row},${col}`;
        const isAlreadyActive = selectedBlocksRef.current.has(key) && selectedBlocksRef.current.get(key)!.targetAlpha > 0;
        drawMode = isAlreadyActive ? 'erase' : 'draw';

        applyBlockAction(touch.clientX, touch.clientY, drawMode);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && isDrawing) {
        const touch = e.touches[0];
        mouseRef.current.targetX = touch.clientX;
        mouseRef.current.targetY = touch.clientY;
        applyBlockAction(touch.clientX, touch.clientY, drawMode);
      }
    };

    const handleTouchEnd = () => {
      isDrawing = false;
      mouseRef.current.targetIntensity = 0;
    };

    window.addEventListener('mousedown', handleMouseDown, { passive: true });
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    // Convert hex color to rgb components
    const hexToRgb = (hex: string) => {
      let c = hex.replace('#', '');
      if (c.length === 3) {
        c = c.split('').map((char) => char + char).join('');
      }
      const num = parseInt(c, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255,
      };
    };

    const render = () => {
      const mouse = mouseRef.current;

      // Smooth mouse lerp
      mouse.x += (mouse.targetX - mouse.x) * 0.12;
      mouse.y += (mouse.targetY - mouse.y) * 0.12;
      mouse.intensity += (mouse.targetIntensity - mouse.intensity) * 0.08;

      // Smoothly interpolate alphas of user-clicked blocks
      selectedBlocksRef.current.forEach((block, key) => {
        block.alpha += (block.targetAlpha - block.alpha) * 0.15;
        if (block.targetAlpha === 0 && block.alpha < 0.01) {
          selectedBlocksRef.current.delete(key);
        }
      });

      ctx.clearRect(0, 0, width, height);

      const rgb = hexToRgb(colorRef.current);
      const cols = Math.ceil(width / GRID_SIZE) + 2;
      const rows = Math.ceil(height / GRID_SIZE) + 2;

      // Precalculate 2D matrix of displaced grid nodes
      const points: { x: number; y: number; elevation: number; glow: number }[][] = [];

      for (let r = 0; r <= rows; r++) {
        points[r] = [];
        const origY = r * GRID_SIZE;

        for (let c = 0; c <= cols; c++) {
          const origX = c * GRID_SIZE;

          let dispX = origX;
          let dispY = origY;
          let elevation = 0;
          let glow = 0;

          if (mouse.intensity > 0.001) {
            const dx = origX - mouse.x;
            const dy = origY - mouse.y;
            const dist = Math.hypot(dx, dy);

            if (dist < INFLUENCE_RADIUS) {
              const ratio = 1 - dist / INFLUENCE_RADIUS;
              // Smooth cosine wave falloff for 3D dome lift
              const wave = Math.sin((ratio * Math.PI) / 2);
              elevation = wave * MAX_ELEVATION * mouse.intensity;
              glow = wave * mouse.intensity;

              // 3D Perspective expansion: points near cursor lift outwards slightly along ray
              const pushFactor = elevation / 650;
              dispX += dx * pushFactor;
              dispY += dy * pushFactor;
            }
          }

          points[r][c] = { x: dispX, y: dispY, elevation, glow };
        }
      }

      // 1. Draw subtle lifted tile backdrops near cursor
      if (mouse.intensity > 0.05) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const pTL = points[r][c];
            const pTR = points[r][c + 1];
            const pBR = points[r + 1][c + 1];
            const pBL = points[r + 1][c];

            const avgGlow = (pTL.glow + pTR.glow + pBR.glow + pBL.glow) / 4;
            if (avgGlow > 0.12) {
              ctx.beginPath();
              ctx.moveTo(pTL.x, pTL.y);
              ctx.lineTo(pTR.x, pTR.y);
              ctx.lineTo(pBR.x, pBR.y);
              ctx.lineTo(pBL.x, pBL.y);
              ctx.closePath();
              ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${avgGlow * 0.04})`;
              ctx.fill();
            }
          }
        }
      }

      // 2. Draw user-clicked highlighted interactive blocks
      selectedBlocksRef.current.forEach((block) => {
        const r = block.row;
        const c = block.col;
        if (
          r >= 0 &&
          r < rows &&
          c >= 0 &&
          c < cols &&
          points[r] &&
          points[r][c] &&
          points[r + 1] &&
          points[r + 1][c + 1]
        ) {
          const pTL = points[r][c];
          const pTR = points[r][c + 1];
          const pBR = points[r + 1][c + 1];
          const pBL = points[r + 1][c];

          // A. Clean subtle neon block fill
          ctx.beginPath();
          ctx.moveTo(pTL.x, pTL.y);
          ctx.lineTo(pTR.x, pTR.y);
          ctx.lineTo(pBR.x, pBR.y);
          ctx.lineTo(pBL.x, pBL.y);
          ctx.closePath();
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${block.alpha * 0.16})`;
          ctx.fill();

          // B. Clean sleek glowing grid border (matches grid thickness)
          ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${block.alpha * 0.6})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // 3. Draw Horizontal Grid Lines
      for (let r = 0; r <= rows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= cols; c++) {
          const pt = points[r][c];
          if (c === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 4. Draw Vertical Grid Lines
      for (let c = 0; c <= cols; c++) {
        ctx.beginPath();
        for (let r = 0; r <= rows; r++) {
          const pt = points[r][c];
          if (r === 0) {
            ctx.moveTo(pt.x, pt.y);
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
        }
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 5. Draw Reactive Highlighted 3D Wave Overlay near mouse
      if (mouse.intensity > 0.01) {
        for (let r = 0; r <= rows; r++) {
          for (let c = 0; c <= cols; c++) {
            const pt = points[r][c];
            if (pt.glow > 0.06) {
              // Horizontal glowing segment
              if (c < cols) {
                const nextP = points[r][c + 1];
                const lineGlow = (pt.glow + nextP.glow) / 2;
                if (lineGlow > 0.06) {
                  ctx.beginPath();
                  ctx.moveTo(pt.x, pt.y);
                  ctx.lineTo(nextP.x, nextP.y);
                  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.08 + lineGlow * 0.38})`;
                  ctx.lineWidth = 1 + lineGlow * 0.8;
                  ctx.stroke();
                }
              }

              // Vertical glowing segment
              if (r < rows) {
                const nextP = points[r + 1][c];
                const lineGlow = (pt.glow + nextP.glow) / 2;
                if (lineGlow > 0.06) {
                  ctx.beginPath();
                  ctx.moveTo(pt.x, pt.y);
                  ctx.lineTo(nextP.x, nextP.y);
                  ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.08 + lineGlow * 0.38})`;
                  ctx.lineWidth = 1 + lineGlow * 0.8;
                  ctx.stroke();
                }
              }
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-0 block w-full h-full"
      style={{ opacity: 0.95 }}
    />
  );
};
