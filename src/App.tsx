/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Zap, Trophy, Skull } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Constants ---
const PLAYER_SIZE = 40;
const ENEMY_SIZE = 35;
const POWERUP_SIZE = 15;
const INITIAL_ENEMY_SPAWN_RATE = 4000; // ms
const MIN_ENEMY_SPAWN_RATE = 600;
const SPAWN_RATE_DECREASE = 40;
const PLAYER_SPEED = 5;
const ENEMY_SPEED_MIN = 2;
const ENEMY_SPEED_MAX = 4;
const ENERGY_PER_POWERUP = 20;
const MAX_ENERGY = 100;

type GameState = 'START' | 'PLAYING' | 'GAMEOVER';

interface Point {
  x: number;
  y: number;
}

interface Particle extends Point {
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

interface Entity extends Point {
  width: number;
  height: number;
  color: string;
}

interface Enemy extends Entity {
  speed: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gameState, setGameState] = useState<GameState>('START');
  const [score, setScore] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [highScore, setHighScore] = useState(0);

  // Game refs to avoid re-renders during loop
  const playerRef = useRef<Entity>({ x: 0, y: 0, width: PLAYER_SIZE, height: PLAYER_SIZE, color: '#a2d2ff' });
  const enemiesRef = useRef<Enemy[]>([]);
  const powerupsRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const keysRef = useRef<Record<string, boolean>>({});
  const lastSpawnTimeRef = useRef(0);
  const spawnRateRef = useRef(INITIAL_ENEMY_SPAWN_RATE);
  const startTimeRef = useRef(0);
  const roadOffsetRef = useRef(0);
  const ultimateEffectRef = useRef<{ active: boolean; radius: number; opacity: number } | null>(null);
  const touchActiveRef = useRef(false);
  const lastTouchRef = useRef<Point | null>(null);

  // --- Initialization ---
  const initGame = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    
    playerRef.current = {
      x: width / 2 - PLAYER_SIZE / 2,
      y: height - 100,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: '#a2d2ff'
    };
    
    enemiesRef.current = [];
    powerupsRef.current = [];
    particlesRef.current = [];
    spawnRateRef.current = INITIAL_ENEMY_SPAWN_RATE;
    lastSpawnTimeRef.current = performance.now();
    startTimeRef.current = performance.now();
    setScore(0);
    setEnergy(0);
    ultimateEffectRef.current = null;
  }, []);

  // --- Input Handling ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'r' && energy >= MAX_ENERGY && gameState === 'PLAYING') {
        activateUltimate();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (gameState !== 'PLAYING') return;
      // Prevent scrolling
      if (e.target instanceof HTMLCanvasElement) {
        e.preventDefault();
      }
      touchActiveRef.current = true;
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchActiveRef.current || gameState !== 'PLAYING') return;
      if (e.target instanceof HTMLCanvasElement) {
        e.preventDefault();
      }
      const touch = e.touches[0];
      const currentTouch = { x: touch.clientX, y: touch.clientY };
      
      if (lastTouchRef.current) {
        const dx = currentTouch.x - lastTouchRef.current.x;
        const dy = currentTouch.y - lastTouchRef.current.y;
        
        const p = playerRef.current;
        p.x += dx;
        p.y += dy;
      }
      
      lastTouchRef.current = currentTouch;
    };

    const handleTouchEnd = () => {
      touchActiveRef.current = false;
      lastTouchRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [energy, gameState]);

  const activateUltimate = () => {
    setEnergy(0);
    ultimateEffectRef.current = { active: true, radius: 0, opacity: 1 };
    
    // P.E.M. desintegra a TODOS los enemigos
    enemiesRef.current = [];
  };

  // --- Game Loop ---
  useEffect(() => {
    let animationFrameId: number;

    const update = (time: number) => {
      if (gameState !== 'PLAYING') return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = canvas;

      // 1. Move Player
      const p = playerRef.current;
      if (keysRef.current['w'] || keysRef.current['arrowup']) p.y -= PLAYER_SPEED;
      if (keysRef.current['s'] || keysRef.current['arrowdown']) p.y += PLAYER_SPEED;
      if (keysRef.current['a'] || keysRef.current['arrowleft']) p.x -= PLAYER_SPEED;
      if (keysRef.current['d'] || keysRef.current['arrowright']) p.x += PLAYER_SPEED;

      // Bounds check
      p.x = Math.max(0, Math.min(width - p.width, p.x));
      p.y = Math.max(0, Math.min(height - p.height, p.y));

      // Road bounds check (Si se sale de la carretera pierde)
      const roadLeft = width * 0.2;
      const roadRight = width * 0.8;
      if (p.x < roadLeft || p.x + p.width > roadRight) {
        setGameState('GAMEOVER');
      }

      // 2. Spawn Enemies & Powerups
      if (time - lastSpawnTimeRef.current > spawnRateRef.current) {
        // Spawn Enemy
        const side = Math.floor(Math.random() * 3); // 0: Top, 1: Left, 2: Right
        let ex = 0, ey = 0;
        if (side === 0) { ex = roadLeft + Math.random() * (roadRight - roadLeft - ENEMY_SIZE); ey = -ENEMY_SIZE; }
        else if (side === 1) { ex = -ENEMY_SIZE; ey = Math.random() * height; }
        else { ex = width; ey = Math.random() * height; }

        enemiesRef.current.push({
          x: ex,
          y: ey,
          width: ENEMY_SIZE,
          height: ENEMY_SIZE,
          color: '#ff0055',
          speed: ENEMY_SPEED_MIN + Math.random() * (ENEMY_SPEED_MAX - ENEMY_SPEED_MIN)
        });

        // Spawn Powerup frequently (Solo en la carretera)
        if (Math.random() > 0.2) {
          const count = Math.floor(Math.random() * 2) + 1; // Spawn 1 or 2
          for (let i = 0; i < count; i++) {
            powerupsRef.current.push({
              x: roadLeft + 20 + Math.random() * (roadRight - roadLeft - 40 - POWERUP_SIZE),
              y: -POWERUP_SIZE - (Math.random() * 100),
              width: POWERUP_SIZE,
              height: POWERUP_SIZE * 2,
              color: '#fffb00'
            });
          }
        }

        lastSpawnTimeRef.current = time;
        spawnRateRef.current = Math.max(MIN_ENEMY_SPAWN_RATE, spawnRateRef.current - SPAWN_RATE_DECREASE);
      }

      // 3. Update Enemies (Chase Player)
      enemiesRef.current.forEach(enemy => {
        const dx = (p.x + p.width / 2) - (enemy.x + enemy.width / 2);
        const dy = (p.y + p.height / 2) - (enemy.y + enemy.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        enemy.x += (dx / dist) * enemy.speed;
        enemy.y += (dy / dist) * enemy.speed;

        // Collision with player
        if (
          p.x < enemy.x + enemy.width &&
          p.x + p.width > enemy.x &&
          p.y < enemy.y + enemy.height &&
          p.y + p.height > enemy.y
        ) {
          setGameState('GAMEOVER');
        }
      });

      // 4. Update Powerups
      powerupsRef.current.forEach((pu, index) => {
        pu.y += 3; // Fall down
        
        // Collision with player
        if (
          p.x < pu.x + pu.width &&
          p.x + p.width > pu.x &&
          p.y < pu.y + pu.height &&
          p.y + p.height > pu.y
        ) {
          setEnergy(prev => Math.min(MAX_ENERGY, prev + ENERGY_PER_POWERUP));
          powerupsRef.current.splice(index, 1);
        }
      });
      powerupsRef.current = powerupsRef.current.filter(pu => pu.y < height);

      // 5. Update Score
      setScore(Math.floor((time - startTimeRef.current) / 100));

      // 6. Update Particles
      if (Math.random() > 0.5) {
        particlesRef.current.push({
          x: p.x + Math.random() * p.width,
          y: p.y + p.height,
          vx: (Math.random() - 0.5) * 2,
          vy: Math.random() * 2 + 1,
          life: 1,
          color: Math.random() > 0.5 ? '#ff758c' : '#a2d2ff',
          size: Math.random() * 4 + 2
        });
      }
      particlesRef.current.forEach(part => {
        part.x += part.vx;
        part.y += part.vy;
        part.life -= 0.02;
      });
      particlesRef.current = particlesRef.current.filter(part => part.life > 0);

      // 7. Update Road Offset
      roadOffsetRef.current = (roadOffsetRef.current + 5) % 100;

      // 8. Update Ultimate Effect
      if (ultimateEffectRef.current?.active) {
        ultimateEffectRef.current.radius += 25;
        ultimateEffectRef.current.opacity -= 0.015;
        if (ultimateEffectRef.current.opacity <= 0) {
          ultimateEffectRef.current = null;
        }
      }
    };

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const { width, height } = canvas;

      // Clear (Cyberpunk / Magical Girl Atmosphere)
      const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, width);
      gradient.addColorStop(0, '#1a0b2e');
      gradient.addColorStop(1, '#050505');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Draw Background Silhouettes (Magical Girl / Cyberpunk)
      ctx.fillStyle = 'rgba(255, 117, 140, 0.05)';
      for (let i = 0; i < 5; i++) {
        const bx = (i * width / 4) + Math.sin(Date.now() / 2000 + i) * 50;
        ctx.beginPath();
        ctx.moveTo(bx, height);
        ctx.lineTo(bx + 100, height - 300);
        ctx.lineTo(bx + 200, height);
        ctx.fill();
      }

      // Draw Road (Low Poly Style)
      const roadLeft = width * 0.2;
      const roadRight = width * 0.8;
      ctx.fillStyle = '#0f0f1a';
      ctx.beginPath();
      ctx.moveTo(roadLeft, 0);
      ctx.lineTo(roadRight, 0);
      ctx.lineTo(roadRight, height);
      ctx.lineTo(roadLeft, height);
      ctx.fill();

      // Draw Road Lines
      ctx.strokeStyle = 'rgba(255, 117, 140, 0.3)';
      ctx.lineWidth = 4;
      for (let i = -100; i < height + 100; i += 100) {
        const y = i + roadOffsetRef.current;
        ctx.beginPath();
        ctx.moveTo(roadLeft, y);
        ctx.lineTo(roadLeft, y + 60);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(roadRight, y);
        ctx.lineTo(roadRight, y + 60);
        ctx.stroke();
      }

      // Draw Particles (Sparkles)
      particlesRef.current.forEach(part => {
        ctx.globalAlpha = part.life;
        ctx.fillStyle = part.color;
        ctx.beginPath();
        // Low poly sparkle (diamond shape)
        ctx.moveTo(part.x, part.y - part.size);
        ctx.lineTo(part.x + part.size, part.y);
        ctx.lineTo(part.x, part.y + part.size);
        ctx.lineTo(part.x - part.size, part.y);
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // Draw Powerups (Low Poly)
      powerupsRef.current.forEach(pu => {
        ctx.fillStyle = pu.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = pu.color;
        ctx.beginPath();
        ctx.moveTo(pu.x + pu.width / 2, pu.y);
        ctx.lineTo(pu.x + pu.width, pu.y + pu.height / 2);
        ctx.lineTo(pu.x + pu.width / 2, pu.y + pu.height);
        ctx.lineTo(pu.x, pu.y + pu.height / 2);
        ctx.closePath();
        ctx.fill();
      });

      // Draw Enemies (Glitch Style)
      enemiesRef.current.forEach(enemy => {
        const isGlitch = Math.random() > 0.8;
        const glitchX = isGlitch ? (Math.random() - 0.5) * 10 : 0;
        
        ctx.fillStyle = isGlitch ? '#00ffff' : enemy.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = enemy.color;
        
        // Low poly glitch car
        ctx.beginPath();
        ctx.moveTo(enemy.x + glitchX, enemy.y);
        ctx.lineTo(enemy.x + enemy.width + glitchX, enemy.y + 5);
        ctx.lineTo(enemy.x + enemy.width - 5 + glitchX, enemy.y + enemy.height);
        ctx.lineTo(enemy.x + 5 + glitchX, enemy.y + enemy.height - 5);
        ctx.closePath();
        ctx.fill();

        if (isGlitch) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Draw Player (Magical Girl / Pastel Blue / Low Poly)
      const p = playerRef.current;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ff758c';
      
      // Low poly car body
      ctx.beginPath();
      ctx.moveTo(p.x + p.width / 2, p.y);
      ctx.lineTo(p.x + p.width, p.y + 10);
      ctx.lineTo(p.x + p.width - 5, p.y + p.height);
      ctx.lineTo(p.x + 5, p.y + p.height);
      ctx.lineTo(p.x, p.y + 10);
      ctx.closePath();
      ctx.fill();

      // Magical Girl Details (Stars/Hearts)
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x + p.width / 2, p.y + p.height / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      // Draw P.E.M. Effect
      if (ultimateEffectRef.current?.active) {
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, ultimateEffectRef.current.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(162, 210, 255, ${ultimateEffectRef.current.opacity})`;
        ctx.lineWidth = 10;
        ctx.stroke();
        
        // Glitchy rings
        ctx.beginPath();
        ctx.arc(p.x + p.width / 2, p.y + p.height / 2, ultimateEffectRef.current.radius * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 117, 140, ${ultimateEffectRef.current.opacity * 0.5})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    };

    const loop = (time: number) => {
      update(time);
      draw();
      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState]);

  // --- Resize Handling ---
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (canvasRef.current) {
          canvasRef.current.width = entry.contentRect.width;
          canvasRef.current.height = entry.contentRect.height;
          if (gameState === 'START') initGame();
        }
      }
    });

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [initGame, gameState]);

  // --- High Score ---
  useEffect(() => {
    if (score > highScore) setHighScore(score);
  }, [score, highScore]);

  const startGame = () => {
    initGame();
    setGameState('PLAYING');
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-black overflow-hidden font-sans text-white touch-none select-none">
      <canvas ref={canvasRef} className="block w-full h-full touch-none" />

      {/* HUD */}
      {gameState === 'PLAYING' && (
        <>
          <div className="absolute top-0 left-0 w-full p-4 md:p-6 flex justify-between items-start pointer-events-none">
            <div className="space-y-1">
              <div className="text-[10px] md:text-xs uppercase tracking-widest opacity-50 font-mono">Puntaje</div>
              <div className="text-2xl md:text-4xl font-black italic tracking-tighter">{score.toLocaleString()}</div>
            </div>
            
            <div className="flex flex-col items-end space-y-4">
              <div className="text-right">
                <div className="text-[10px] md:text-xs uppercase tracking-widest opacity-50 font-mono">P.E.M. (R)</div>
                <div className="w-32 md:w-48 h-2 md:h-3 bg-white/10 rounded-full overflow-hidden border border-white/5 mt-1">
                  <motion.div 
                    className="h-full bg-pink-400 shadow-[0_0_15px_rgba(244,114,182,0.8)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${energy}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                  />
                </div>
                {energy >= MAX_ENERGY && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-[8px] md:text-[10px] text-pink-400 font-bold uppercase mt-1 tracking-widest"
                  >
                    Listo para el Pulso
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Mobile Ultimate Button */}
          <div className="absolute bottom-8 right-8 z-40 md:hidden">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (energy >= MAX_ENERGY) activateUltimate();
              }}
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center transition-all active:scale-90 ${
                energy >= MAX_ENERGY 
                ? 'bg-pink-500 border-white shadow-[0_0_20px_rgba(236,72,153,0.8)]' 
                : 'bg-white/10 border-white/20 opacity-50'
              }`}
            >
              <Zap size={32} className={energy >= MAX_ENERGY ? 'text-white fill-white' : 'text-white/40'} />
            </button>
          </div>
        </>
      )}

      {/* Screens */}
      <AnimatePresence>
        {gameState === 'START' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 z-50"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center space-y-8"
            >
              <div className="space-y-2">
                <h1 className="text-5xl md:text-8xl font-black italic tracking-tighter uppercase leading-none text-[#ff758c] drop-shadow-[0_0_20px_rgba(255,117,140,0.6)]">
                  Last One
                </h1>
                <p className="text-white/40 font-mono text-[10px] md:text-sm tracking-widest uppercase">El camino neón nunca termina</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto text-left">
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="text-[10px] uppercase opacity-40 mb-2 font-bold">Movimiento</div>
                  <div className="flex items-center gap-2">
                    <div className="hidden md:flex gap-2">
                      {['W', 'A', 'S', 'D'].map(k => (
                        <span key={k} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded border border-white/20 text-xs font-bold">{k}</span>
                      ))}
                    </div>
                    <span className="text-[10px] opacity-60 md:hidden">Desliza para mover</span>
                  </div>
                </div>
                <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                  <div className="text-[10px] uppercase opacity-40 mb-2 font-bold">P.E.M.</div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 flex items-center justify-center bg-pink-400/20 text-pink-400 rounded border border-pink-400/40 text-xs font-bold">R</span>
                    <span className="text-[10px] opacity-60">Botón o tecla R</span>
                  </div>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="group relative px-12 py-4 bg-white text-black font-black uppercase tracking-widest rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95"
              >
                <div className="relative z-10 flex items-center gap-2">
                  <Play size={20} fill="currentColor" />
                  Arrancar Motor
                </div>
                <div className="absolute inset-0 bg-pink-400 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
            </motion.div>
          </motion.div>
        )}

        {gameState === 'GAMEOVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-purple-950/90 backdrop-blur-md flex flex-col items-center justify-center p-8 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center space-y-8 md:space-y-12 max-w-lg w-full"
            >
              <div className="space-y-4">
                <div className="inline-flex p-3 md:p-4 bg-pink-500/20 rounded-full text-pink-500 mb-2 md:mb-4">
                  <Skull size={32} className="md:w-12 md:h-12" />
                </div>
                <h2 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase leading-none">Destruido</h2>
                <p className="text-white/60 text-sm md:text-base">Sobreviviste por {Math.floor(score / 10)} segundos en el camino neón.</p>
              </div>

              <div className="grid grid-cols-2 gap-4 md:gap-6">
                <div className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/10 text-center">
                  <div className="text-[8px] md:text-[10px] uppercase opacity-40 mb-1 font-bold tracking-widest">Puntaje Final</div>
                  <div className="text-xl md:text-3xl font-black italic">{score.toLocaleString()}</div>
                </div>
                <div className="bg-white/5 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-white/10 text-center">
                  <div className="text-[8px] md:text-[10px] uppercase opacity-40 mb-1 font-bold tracking-widest">Mejor Récord</div>
                  <div className="text-xl md:text-3xl font-black italic text-pink-400">{highScore.toLocaleString()}</div>
                </div>
              </div>

              <button 
                onClick={startGame}
                className="w-full py-4 md:py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl md:rounded-3xl flex items-center justify-center gap-3 transition-all hover:bg-pink-400 hover:shadow-[0_0_30px_rgba(244,114,182,0.5)] active:scale-95"
              >
                <RotateCcw size={20} className="md:w-6 md:h-6" />
                Reintentar
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(0,242,255,0.05)_0%,transparent_70%)]" />
      </div>
    </div>
  );
}
