import { useState, useEffect, useRef } from 'react';
import type { AgentStatus } from './useJarvisSocket';

/**
 * Prepared hook for Audio Visualizer.
 * Provides real-time frequency bar heights (0 to 100) responsive to Agent status
 * or live microphone AudioContext in future stages.
 */
export function useAudioVisualizer(status: AgentStatus, numBars: number = 28) {
  const [frequencies, setFrequencies] = useState<number[]>(() =>
    Array(numBars).fill(8)
  );
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let tick = 0;

    const animate = () => {
      tick += 0.08;

      setFrequencies(() => {
        const newFreqs: number[] = [];

        for (let i = 0; i < numBars; i++) {
          let height = 6;
          const centerDist = Math.abs(i - numBars / 2) / (numBars / 2);
          const bellCurve = Math.max(0.1, 1 - centerDist * 0.7);

          if (status === 'speaking') {
            // Dynamic speaking wave
            const wave1 = Math.sin(tick * 3 + i * 0.4);
            const wave2 = Math.cos(tick * 5 - i * 0.2);
            height = 15 + Math.abs(wave1 * 40 + wave2 * 35) * bellCurve;
          } else if (status === 'listening') {
            // Rhythmic pulsing listening wave
            const wave = Math.sin(tick * 2 + i * 0.3);
            height = 12 + Math.abs(wave * 50) * bellCurve;
          } else if (status === 'thinking') {
            // Travelling ripple thinking wave
            const wave = Math.sin(tick * 4 + i * 0.6);
            height = 10 + Math.abs(wave * 35) * bellCurve;
          } else {
            // Idle ambient breathing waveform
            const wave = Math.sin(tick * 1.2 + i * 0.2);
            height = 6 + Math.abs(wave * 12) * bellCurve;
          }

          newFreqs.push(Math.min(100, Math.max(4, height)));
        }

        return newFreqs;
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [status, numBars]);

  return frequencies;
}
