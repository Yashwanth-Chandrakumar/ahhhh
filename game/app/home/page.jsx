// app/page.js
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CHICKEN_WIDTH = 50;
const CHICKEN_HEIGHT = 40;
// const CHICKEN_X_POSITION = CANVAS_WIDTH / 4; // REMOVED - Chicken now moves in the world
const CHICKEN_INITIAL_WORLD_X = 100; // Where the chicken starts in the game world
const CAMERA_FOLLOW_X_OFFSET = CANVAS_WIDTH / 3; // Camera tries to keep chicken here on screen

const GRAVITY = 0.6;
const MIN_JUMP_STRENGTH = -6;
const MAX_JUMP_STRENGTH = -16;
// const SCROLL_SPEED = 3; // REMOVED - World scroll is now player-driven

const WALK_SPEED = 3; // Horizontal speed when making a "slight" sound
const JUMP_FORWARD_SPEED = 4; // Horizontal speed when jumping

const JUMP_ACTIVATION_VOLUME_OFFSET = 20; // How much louder a sound needs to be than base threshold to trigger a jump.
const MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING = 100;

const COLOR_SKY = '#333366'; /* ... other colors ... */
const COLOR_WATER = '#0077BE';
const COLOR_WAVE = '#FFFFFF';
const COLOR_PLATFORM_GRASS = '#5cb85c';
const COLOR_PLATFORM_DIRT = '#8B4513';
const COLOR_CHICKEN_BODY = '#FFFFFF';
const COLOR_CHICKEN_COMB = '#FF0000';
const COLOR_CHICKEN_BEAK_LEGS = '#FFFF00';
const COLOR_SPIKE = '#A9A9A9';
const COLOR_BRIDGE_PLANK = '#A0522D';
const COLOR_TEXT = '#FFFFFF';
const COLOR_TROPHY = '#FFD700';
const FINISH_LINE_COLOR_PRIMARY = '#000000';
const FINISH_LINE_COLOR_SECONDARY = '#FFFFFF';

const SMOOTHING_TIME_CONSTANT = 0.2;

export default function ChickenGamePage() {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const dataArrayRef = useRef(null);

  const [gameState, setGameState] = useState('loading');
  const [score, setScore] = useState(0); // Could represent distance or time
  const [isMicrophoneAllowed, setIsMicrophoneAllowed] = useState(null);
  const [baseSoundThreshold, setBaseSoundThreshold] = useState(30); // Controlled by slider

  const chickenRef = useRef({
    worldX: CHICKEN_INITIAL_WORLD_X, // Chicken's position in the game world
    y: CANVAS_HEIGHT / 2, vy: 0, width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT,
    onGround: false, bobOffset: 0, bobDirection: 1,
  });
  const cameraXRef = useRef(0); // Camera's top-left X in the game world
  const levelElementsRef = useRef([]);
  const confettiRef = useRef([]);
  const bridgeStateRef = useRef({ playerOnBridgePost: false, activePlanks: 0 });

  const spawnConfetti = useCallback(() => { /* ... same ... */
    confettiRef.current = [];
    for (let i = 0; i < 100; i++) {
      confettiRef.current.push({
        x: Math.random() * CANVAS_WIDTH, y: Math.random() * -CANVAS_HEIGHT,
        size: Math.random() * 5 + 5, speedY: Math.random() * 3 + 2,
        color: `hsl(${Math.random() * 360}, 100%, 70%)`,
        sway: Math.random() * 2 - 1, swayCounter: Math.random() * Math.PI * 2,
      });
    }
  }, []);

  const generateLevel = useCallback(() => {
    const elements = [];
    let currentX = 0; // Level elements start at worldX = 0
    // Initial platform needs to be wide enough or chicken starts on it
    elements.push({ type: 'platform', id: `p0`, x: currentX, y: CANVAS_HEIGHT - 100, width: CHICKEN_INITIAL_WORLD_X + 300, height: 100 });
    currentX += CHICKEN_INITIAL_WORLD_X + 300;

    elements.push({ type: 'gap', id: `g0`, width: 120 }); currentX += 120;
    elements.push({ type: 'platform', id: `p1`, x: currentX, y: CANVAS_HEIGHT - 100, width: 250, height: 100, hasSpike: true, spikeRelativeX: 100 });
    currentX += 250;
    // ... rest of level generation (ensure X coordinates are world coordinates)
    elements.push({ type: 'gap', id: `g1`, width: 100 }); currentX += 100;
    elements.push({ type: 'platform', id: `p2`, x: currentX, y: CANVAS_HEIGHT - 150, width: 200, height: 150 });
    currentX += 200;
    elements.push({ type: 'gap', id: `g2`, width: 150 }); currentX += 150;
    elements.push({ type: 'platform', id: `p3`, x: currentX, y: CANVAS_HEIGHT - 100, width: 300, height: 100 });
    currentX += 300;
    elements.push({ type: 'gap', id: `g3`, width: 80 }); currentX += 80;
    elements.push({ type: 'platform', id: `p4`, x: currentX, y: CANVAS_HEIGHT - 250, width: 80, height: 250 });
    currentX += 80;
    elements.push({ type: 'gap', id: `g4`, width: 180 }); currentX += 180;
    elements.push({ type: 'platform', id: `p5`, x: currentX, y: CANVAS_HEIGHT - 200, width: 80, height: 200 });
    currentX += 80;
    elements.push({ type: 'gap', id: `g5`, width: 100 }); currentX += 100;
    elements.push({ type: 'platform', id: `p6`, x: currentX, y: CANVAS_HEIGHT - 100, width: 400, height: 100 });
    elements.push({ type: 'shuriken_spawn', id: `s0`, x: currentX + 200, spawned: false }); // world X for spawn trigger
    currentX += 400;
    elements.push({ type: 'gap', id: `g6`, width: 100 }); currentX += 100;
    elements.push({ type: 'warning_sign', id: `ws0`, x: currentX, y: CANVAS_HEIGHT - 300 });
    elements.push({ type: 'platform', id: `p7`, x: currentX, y: CANVAS_HEIGHT - 100, width: 150, height: 100 });
    currentX += 150;
    elements.push({ type: 'gap', id: `g7`, width: 80 }); currentX += 80;
    const bridgeStartX = currentX;
    elements.push({ type: 'bridge_post', id: `bp0`, x: bridgeStartX, y: CANVAS_HEIGHT - 200, width: 60, height: 200 });
    const bridgePlanks = [ /* ... */ ];
    elements.push({ type: 'bridge_structure', id: `bs0`, x: bridgeStartX, y: CANVAS_HEIGHT - 200, planks: bridgePlanks, activePlanks: 0 });
    let approxBridgeWidth = 60; bridgePlanks.forEach((plank, index) => { approxBridgeWidth += plank.width; if (index < bridgePlanks.length -1) approxBridgeWidth += 20; });
    currentX += approxBridgeWidth;
    elements.push({ type: 'gap', id: `g8`, width: 80 }); currentX += 80;
    elements.push({ type: 'platform', id: `p8`, x: currentX, y: CANVAS_HEIGHT - 100, width: 300, height: 100 });
    currentX += 300;
    elements.push({ type: 'gap', id: `g9`, width: 100 }); currentX += 100;
    elements.push({ type: 'finish_line', id: `fl0`, x: currentX, y: CANVAS_HEIGHT - 150, width: 50, height: 150 }); // world X
    levelElementsRef.current = elements;
  }, []);

  const initAudio = useCallback(async () => { /* ... same ... */
    if (audioContextRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      const context = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyserRef.current = analyser;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsMicrophoneAllowed(true);
    } catch (err) { console.error("Error accessing microphone:", err); setIsMicrophoneAllowed(false); }
    setGameState('ready');
  }, [setIsMicrophoneAllowed, setGameState]);

  const getSoundInfo = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || dataArrayRef.current.length === 0) {
      return { detected: false, volume: 0 };
    }
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    let sum = 0; for (let i = 0; i < dataArrayRef.current.length; i++) { sum += dataArrayRef.current[i]; }
    const averageVolume = sum / dataArrayRef.current.length;
    return {
      detected: averageVolume > baseSoundThreshold, // Use state variable for threshold
      volume: averageVolume,
    };
  }, [baseSoundThreshold]);

  const resetGame = useCallback(() => {
    chickenRef.current = {
      worldX: CHICKEN_INITIAL_WORLD_X,
      y: CANVAS_HEIGHT - 100 - CHICKEN_HEIGHT, // Start on the initial platform
      vy: 0, width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT,
      onGround: true, // Start on ground
      bobOffset: 0, bobDirection: 1,
    };
    cameraXRef.current = 0; // Camera starts at world origin
    setScore(0);
    confettiRef.current = [];
    bridgeStateRef.current = { playerOnBridgePost: false, activePlanks: 0 };
    generateLevel(); // Regenerate level to reset shuriken spawns etc.
     levelElementsRef.current = levelElementsRef.current.map(el => {
        if (el.type === 'shuriken_spawn') return { ...el, spawned: false };
        if (el.type === 'bridge_structure') return { ...el, activePlanks: 0 };
        return el;
    }).filter(el => el.type !== 'shuriken_active' && el.type !== 'bridge_plank_active');
  }, [generateLevel, setScore]);

  const startGame = useCallback(() => { /* ... same ... */
    if (isMicrophoneAllowed === false) { alert("Microphone access was denied or failed. Use Spacebar/Click for a medium jump (no forward movement)."); }
    resetGame();
    setGameState('playing');
  }, [isMicrophoneAllowed, resetGame, setGameState]);

  const updateGame = useCallback(() => {
    const chicken = chickenRef.current;
    // Chicken Physics (Vertical)
    chicken.vy += GRAVITY;
    chicken.y += chicken.vy;
    chicken.onGround = false;

    const soundInfo = getSoundInfo();
    let isJumpingThisFrame = false;

    if (soundInfo.detected) {
      if (soundInfo.volume > baseSoundThreshold + JUMP_ACTIVATION_VOLUME_OFFSET) {
        // Loud sound: Jump and move forward
        if (chicken.onGround) {
          isJumpingThisFrame = true;
          const normalizedVolume = Math.min(1, Math.max(0, (soundInfo.volume - (baseSoundThreshold + JUMP_ACTIVATION_VOLUME_OFFSET)) / (MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING - (baseSoundThreshold + JUMP_ACTIVATION_VOLUME_OFFSET))));
          chicken.vy = MIN_JUMP_STRENGTH + normalizedVolume * (MAX_JUMP_STRENGTH - MIN_JUMP_STRENGTH);
        }
        chicken.worldX += JUMP_FORWARD_SPEED;
      } else {
        // Slight sound (above base, below jump activation): Walk forward
        chicken.worldX += WALK_SPEED;
      }
    }

    // Camera Follow Logic
    // Try to keep chicken at CAMERA_FOLLOW_X_OFFSET on screen
    const desiredCameraX = chicken.worldX - CAMERA_FOLLOW_X_OFFSET;
    // Smooth camera movement (optional, can just set cameraXRef.current = desiredCameraX for instant follow)
    cameraXRef.current += (desiredCameraX - cameraXRef.current) * 0.1; // Adjust 0.1 for smoothness
    if (cameraXRef.current < 0) cameraXRef.current = 0; // Don't scroll before world origin


    // Chicken's screen X position for collision and drawing
    const chickenScreenX = chicken.worldX - cameraXRef.current;
    const chickenRect = { x: chickenScreenX, y: chicken.y, width: chicken.width, height: chicken.height };
    let onAnySurface = false;

    levelElementsRef.current.forEach(element => {
      const elementScreenX = element.x - cameraXRef.current; // All elements are drawn relative to camera
      // Platform/Bridge Collision
      if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') {
        const elRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
        // Check collision with platform top
        if (chickenRect.x + chickenRect.width > elRect.x && chickenRect.x < elRect.x + elRect.width &&
            chickenRect.y + chickenRect.height > elRect.y &&
            chickenRect.y + chickenRect.height < elRect.y + Math.max(chicken.vy,0) + 20 && // Buffer for fast fall
            chicken.vy >= 0) {
          chicken.y = elRect.y - chickenRect.height; chicken.vy = 0; chicken.onGround = true; onAnySurface = true;
          if (element.type === 'bridge_post') bridgeStateRef.current.playerOnBridgePost = true;
          else bridgeStateRef.current.playerOnBridgePost = false;
        }
        // Spike Collision
        if (element.hasSpike) { /* ... */
             const spikeRect = { x: elRect.x + element.spikeRelativeX, y: elRect.y - 30, width: 30, height: 30 };
            if (chickenRect.x < spikeRect.x + spikeRect.width && chickenRect.x + chickenRect.width > spikeRect.x &&
                chickenRect.y < spikeRect.y + spikeRect.height && chickenRect.y + chickenRect.height > spikeRect.y) {
              setGameState('gameOver');
            }
        }
      }
      // Shuriken Spawn (Triggered by shuriken_spawn's worldX relative to camera)
      else if (element.type === 'shuriken_spawn' && !element.spawned) {
          // element.x is worldX of spawner. Check if it's coming into view.
          if (element.x - cameraXRef.current < CANVAS_WIDTH + 100 && element.x - cameraXRef.current > -100) {
              levelElementsRef.current.push({
                type: 'shuriken_active', id: `sa-${element.id}-${Date.now()}`,
                worldX: element.x + Math.random() * 100 - 50, // Shuriken's own world X, slightly randomized from spawner
                y: Math.random() * (CANVAS_HEIGHT / 2) + 50, size: 30,
                // Speed relative to the static world, not just screen
                speedX_world: -(WALK_SPEED + 2 + Math.random() * 3), // Make it faster than player's walk
                rotation: 0, active: true,
              });
              element.spawned = true;
          }
      }
      // Shuriken Move & Collide
      else if (element.type === 'shuriken_active') {
          element.worldX += element.speedX_world; // Move shuriken in the world
          const shurikenScreenX = element.worldX - cameraXRef.current;
          element.rotation += 0.2;
          if (shurikenScreenX + element.size < -50) element.active = false; // Off-screen left considerably
          const shurikenRect = { x: shurikenScreenX, y: element.y, width: element.size, height: element.size };
          if (chickenRect.x < shurikenRect.x + shurikenRect.width && /* ... collision ... */
              chickenRect.x + chickenRect.width > shurikenRect.x &&
              chickenRect.y < shurikenRect.y + shurikenRect.height &&
              chickenRect.y + chickenRect.height > shurikenRect.y) {
            setGameState('gameOver');
          }
      }
      // Bridge Logic
      else if (element.type === 'bridge_structure') { /* ... */
         if (bridgeStateRef.current.playerOnBridgePost && element.activePlanks < element.planks.length) {
          const soundForBridge = getSoundInfo();
          if (soundForBridge.detected || chicken.onGround) {
            const newPlankIndex = element.activePlanks; const plankDef = element.planks[newPlankIndex]; const plankId = `bpa-${element.id}-${newPlankIndex}`;
            if (!levelElementsRef.current.find(e => e.id === plankId)) {
              levelElementsRef.current.push({ type: 'bridge_plank_active', id: plankId, x: element.x + plankDef.relativeX, /* world x */ y: element.y + plankDef.yOffset, width: plankDef.width, height: plankDef.height, });
              element.activePlanks++;
            }
          }
        }
      }
      // Finish Line
      else if (element.type === 'finish_line') {
        const finishRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
        if (chickenRect.x + chickenRect.width > finishRect.x && /* ... */
             chickenRect.x < finishRect.x + finishRect.width &&
            chickenRect.y + chickenRect.height > finishRect.y &&
            chickenRect.y < finishRect.y + finishRect.height) {
          setGameState('won'); spawnConfetti();
        }
      }
    });
    levelElementsRef.current = levelElementsRef.current.filter(el => el.type !== 'shuriken_active' || el.active);

    // Fall into water / off screen
    if (chicken.y + chicken.height > CANVAS_HEIGHT - 50 && gameState !== 'gameOver' && gameState !== 'won') { setGameState('gameOver'); }
    if (chicken.y > CANVAS_HEIGHT + chicken.height) { setGameState('gameOver'); } // Completely fallen
    if (!onAnySurface && chicken.y < CANVAS_HEIGHT - 50 - chicken.height) chicken.onGround = false;
    if (gameState === 'playing') { setScore(chicken.worldX / 100); } // Score based on distance

  }, [getSoundInfo, setGameState, setScore, spawnConfetti, gameState, baseSoundThreshold]);

  const updateConfetti = useCallback(() => { /* ... same ... */
      confettiRef.current.forEach(c => {
      c.y += c.speedY; c.swayCounter += 0.05; c.x += Math.sin(c.swayCounter) * c.sway;
      if (c.y > CANVAS_HEIGHT) { c.y = Math.random() * -100 - 20; c.x = Math.random() * CANVAS_WIDTH; }
    });
  }, []);

  const refinedDraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = COLOR_SKY; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Water relative to camera (appears static at bottom of screen)
    ctx.fillStyle = COLOR_WATER; ctx.fillRect(0, CANVAS_HEIGHT - 50, CANVAS_WIDTH, 50);
    ctx.fillStyle = COLOR_WAVE;
    for (let i = 0; i < CANVAS_WIDTH / 30 + 2; i++) {
      // Wave X calculation needs to be relative to camera's current view of the world,
      // but also create a continuous pattern.
      // (cameraXRef.current % 30) gives a repeating offset for the wave pattern
      // as the camera moves.
      const wavePatternOffset = cameraXRef.current % 30;
      const waveBaseX = (i * 30 - wavePatternOffset);
      // Ensure it draws waves across the whole screen even if cameraX is large
      const waveX = (waveBaseX % (CANVAS_WIDTH + 30)) - ( (waveBaseX < 0 && (CANVAS_WIDTH+30 !==0)) ? (CANVAS_WIDTH+30) : 0);


      ctx.beginPath(); ctx.moveTo(waveX, CANVAS_HEIGHT - 45);
      ctx.quadraticCurveTo(waveX + 7.5, CANVAS_HEIGHT - 55, waveX + 15, CANVAS_HEIGHT - 45);
      ctx.quadraticCurveTo(waveX + 22.5, CANVAS_HEIGHT - 35, waveX + 30, CANVAS_HEIGHT - 45);
      ctx.fill();
    }

    // Draw Level Elements (all element X are worldX, convert to screenX for drawing)
    levelElementsRef.current.forEach(element => {
      const elementScreenX = element.x - cameraXRef.current;
      // Cull elements not on screen
      if (elementScreenX + (element.width || element.size || 50) < 0 || elementScreenX > CANVAS_WIDTH) { return; }
      // ... (rest of element drawing logic using elementScreenX for X position) ...
       if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') {
        ctx.fillStyle = COLOR_PLATFORM_DIRT; ctx.fillRect(elementScreenX, element.y, element.width, element.height);
        if (element.type === 'platform') { ctx.fillStyle = COLOR_PLATFORM_GRASS; ctx.fillRect(elementScreenX, element.y, element.width, 20); }
        else if (element.type === 'bridge_plank_active') { ctx.fillStyle = COLOR_BRIDGE_PLANK; ctx.fillRect(elementScreenX, element.y, element.width, element.height); }
        if (element.hasSpike) {
            const spikeWidth = 30, spikeHeight = 30; const spikeX = elementScreenX + element.spikeRelativeX; const spikeY = element.y - spikeHeight;
            ctx.fillStyle = COLOR_SPIKE; ctx.beginPath(); ctx.moveTo(spikeX, spikeY + spikeHeight); ctx.lineTo(spikeX + spikeWidth / 2, spikeY); ctx.lineTo(spikeX + spikeWidth, spikeY + spikeHeight); ctx.closePath(); ctx.fill();
        }
      } else if (element.type === 'shuriken_active') {
          const shurikenScreenX = element.worldX - cameraXRef.current; // Calculate screenX for drawing
          if (shurikenScreenX + element.size < 0 || shurikenScreenX > CANVAS_WIDTH) return; // Cull
          ctx.save(); ctx.translate(shurikenScreenX + element.size / 2, element.y + element.size / 2); ctx.rotate(element.rotation);
          ctx.fillStyle = '#555555'; ctx.strokeStyle = '#333333'; ctx.lineWidth = 2; const armLength = element.size / 2; ctx.beginPath();
          for (let j = 0; j < 4; j++) { ctx.moveTo(0,0); ctx.lineTo(armLength * Math.cos(Math.PI/2 * j), armLength * Math.sin(Math.PI/2*j)); ctx.lineTo(armLength/2 * Math.cos(Math.PI/2 * j + Math.PI/4), armLength/2 * Math.sin(Math.PI/2*j + Math.PI/4)); }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (element.type === 'warning_sign') { /* ... */
           const signSize = 50; ctx.fillStyle = '#FFCC00'; ctx.beginPath(); ctx.moveTo(elementScreenX + signSize / 2, element.y); ctx.lineTo(elementScreenX + signSize, element.y + signSize * 0.866); ctx.lineTo(elementScreenX, element.y + signSize * 0.866); ctx.closePath(); ctx.fill();
           ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#000000'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', elementScreenX + signSize / 2, element.y + signSize * 0.65);
      } else if (element.type === 'finish_line') { /* ... */
          const poleWidth = 10; ctx.fillStyle = '#777777'; ctx.fillRect(elementScreenX, element.y, poleWidth, element.height);
          const squareSize = 10; for (let r = 0; r < 3; r++) { for (let c = 0; c < 5; c++) { ctx.fillStyle = (r + c) % 2 === 0 ? FINISH_LINE_COLOR_PRIMARY : FINISH_LINE_COLOR_SECONDARY; ctx.fillRect(elementScreenX + poleWidth + c * squareSize, element.y + r * squareSize, squareSize, squareSize); } }
      }
    });

    // Draw Chicken (chickenScreenX is calculated in updateGame, or recalculate here)
    const ch = chickenRef.current;
    const chickenScreenX = ch.worldX - cameraXRef.current;
    const chickenDrawY = ch.y + ch.bobOffset;
    // ... (rest of chicken drawing logic using chickenScreenX for X position) ...
    ctx.fillStyle = COLOR_CHICKEN_BODY; ctx.beginPath(); ctx.ellipse(chickenScreenX + ch.width / 2, chickenDrawY + ch.height / 2, ch.width / 2, ch.height / 2, 0, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = COLOR_CHICKEN_COMB; ctx.beginPath(); ctx.ellipse(chickenScreenX + ch.width / 2, chickenDrawY + 5, 10, 8, 0, Math.PI, 2 * Math.PI); ctx.fillRect(chickenScreenX + ch.width / 2 - 5, chickenDrawY + 5, 10, 5); ctx.fill();
    ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS; ctx.beginPath(); ctx.moveTo(chickenScreenX + ch.width, chickenDrawY + ch.height / 2); ctx.lineTo(chickenScreenX + ch.width + 15, chickenDrawY + ch.height / 2 + 5); ctx.lineTo(chickenScreenX + ch.width, chickenDrawY + ch.height / 2 + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#000000'; ctx.beginPath(); ctx.arc(chickenScreenX + ch.width * 0.75, chickenDrawY + ch.height * 0.35, 3, 0, 2 * Math.PI); ctx.fill();
    if (chickenDrawY + ch.height < CANVAS_HEIGHT - 50 - 5) { ctx.strokeStyle = COLOR_CHICKEN_BEAK_LEGS; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(chickenScreenX + ch.width * 0.3, chickenDrawY + ch.height); ctx.lineTo(chickenScreenX + ch.width * 0.3, chickenDrawY + ch.height + 10); ctx.moveTo(chickenScreenX + ch.width * 0.6, chickenDrawY + ch.height); ctx.lineTo(chickenScreenX + ch.width * 0.6, chickenDrawY + ch.height + 10); ctx.stroke(); }


    // UI (Timer/Score, Mic Icon) - These are static on screen
    ctx.fillStyle = COLOR_TEXT; ctx.font = '24px Arial'; ctx.textAlign = 'left';
    const micX = 20, micY = 30; /* ... mic icon draw ... */
    ctx.fillRect(micX, micY - 10, 10, 20); ctx.beginPath(); ctx.arc(micX + 5, micY - 10, 8, Math.PI, 2 * Math.PI); ctx.fill(); ctx.fillRect(micX + 2, micY + 10, 6, 10);
    ctx.fillText(`Dist: ${score.toFixed(0)}m`, 70, 40); // Score is distance

    // Game Over / Won / Ready Screens
    if (gameState === 'gameOver') { /* ... */
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); ctx.fillStyle = COLOR_TEXT; ctx.font = '48px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Game Over!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30); ctx.font = '24px Arial';
        ctx.fillText(`Distance: ${score.toFixed(0)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20); ctx.fillText('Click or Say Something to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    } else if (gameState === 'won') { /* ... */
        updateConfetti(); confettiRef.current.forEach(c => { ctx.fillStyle = c.color; ctx.fillRect(c.x, c.y, c.size, c.size); });
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        const trophyX = CANVAS_WIDTH / 2, trophyY = CANVAS_HEIGHT / 2 - 80; const trophyWidth = 80, trophyHeight = 100; ctx.fillStyle = COLOR_TROPHY;
        ctx.fillRect(trophyX - trophyWidth/2, trophyY + trophyHeight - 20, trophyWidth, 20); ctx.fillRect(trophyX - 10, trophyY + trophyHeight - 40, 20, 20);
        ctx.beginPath(); ctx.moveTo(trophyX - trophyWidth/2, trophyY + trophyHeight - 40); ctx.quadraticCurveTo(trophyX, trophyY - 20, trophyX + trophyWidth/2, trophyY + trophyHeight - 40); ctx.lineTo(trophyX + trophyWidth/2 - 10, trophyY); ctx.quadraticCurveTo(trophyX, trophyY - 10, trophyX - trophyWidth/2 + 10, trophyY); ctx.closePath(); ctx.fill();
        const cuteChickenSize = 40; ctx.fillStyle = COLOR_CHICKEN_BODY; ctx.beginPath(); ctx.arc(trophyX, trophyY - cuteChickenSize/3, cuteChickenSize/2, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = COLOR_CHICKEN_COMB; ctx.beginPath(); ctx.arc(trophyX, trophyY - cuteChickenSize/3 - cuteChickenSize/4, cuteChickenSize/5, Math.PI, 2*Math.PI); ctx.fill();
        ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS; ctx.beginPath(); ctx.moveTo(trophyX + cuteChickenSize/2.5, trophyY - cuteChickenSize/3); ctx.lineTo(trophyX + cuteChickenSize/2.5 + 8, trophyY - cuteChickenSize/3 + 3); ctx.lineTo(trophyX + cuteChickenSize/2.5, trophyY - cuteChickenSize/3 + 6); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(trophyX - 8, trophyY - cuteChickenSize/2.8, 4, 0.25*Math.PI, 0.75*Math.PI); ctx.stroke(); ctx.beginPath(); ctx.arc(trophyX + 8, trophyY - cuteChickenSize/2.8, 4, 0.25*Math.PI, 0.75*Math.PI); ctx.stroke();
        ctx.fillStyle = COLOR_CHICKEN_BODY; ctx.beginPath(); ctx.ellipse(trophyX - cuteChickenSize/2, trophyY - cuteChickenSize/6, cuteChickenSize/3, cuteChickenSize/4, -0.3*Math.PI, 0, 2*Math.PI); ctx.fill(); ctx.beginPath(); ctx.ellipse(trophyX + cuteChickenSize/2, trophyY - cuteChickenSize/6, cuteChickenSize/3, cuteChickenSize/4, 0.3*Math.PI, 0, 2*Math.PI); ctx.fill();
        ctx.fillStyle = COLOR_TEXT; ctx.font = '48px Arial'; ctx.textAlign = 'center'; ctx.fillText('You Won!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50);
        ctx.font = '24px Arial'; ctx.fillText(`Final Distance: ${score.toFixed(0)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90); ctx.fillText('Click or Say Something to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 130);
    } else if (gameState === 'ready') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.fillStyle = COLOR_TEXT; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        if (isMicrophoneAllowed === null) { ctx.fillText('Requesting microphone...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); }
        else if (isMicrophoneAllowed === false) { ctx.fillText('Mic denied. Click/Space for small jump.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); }
        else { ctx.fillText('Make Sounds to Move & Jump!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15);
               ctx.fillText('Click or Say Loudly to Start.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);}
    }
  }, [gameState, score, isMicrophoneAllowed, updateConfetti, cameraXRef]); // cameraXRef added for wave drawing

  useEffect(() => { /* Initial setup effect ... same logic ... */
    generateLevel();
    if (isMicrophoneAllowed === null && !audioContextRef.current) { initAudio(); }
    const handleKeyPress = (e) => {
        if (e.code === 'Space') {
            if (gameState === 'playing' && chickenRef.current.onGround) {
                chickenRef.current.vy = MIN_JUMP_STRENGTH; // Space gives a small, fixed jump
                // No automatic forward movement with space in this new model
            } else if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
                startGame();
            }
        }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => { /* cleanup ... */
        window.removeEventListener('keydown', handleKeyPress);
        if (microphoneStreamRef.current) { microphoneStreamRef.current.getTracks().forEach(track => track.stop()); }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(e => console.error("Error closing audio context", e)); audioContextRef.current = null; }
    };
  }, [generateLevel, initAudio, startGame, gameState, isMicrophoneAllowed]);

  useEffect(() => { /* Game loop effect ... same logic ... */
    let animationFrameId;
    const gameLoop = () => { if (gameState === 'playing') { updateGame(); } refinedDraw(); animationFrameId = requestAnimationFrame(gameLoop); };
    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, updateGame, refinedDraw]);

  const handleCanvasClick = useCallback(() => { /* Click gives small fixed jump, or starts */
    if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
      if (isMicrophoneAllowed === null && !audioContextRef.current) { initAudio(); }
      else { startGame(); }
    } else if (gameState === 'playing' && chickenRef.current.onGround) {
      chickenRef.current.vy = MIN_JUMP_STRENGTH; // Click also gives a small, fixed jump
       // No automatic forward movement with click in this new model
    }
  }, [gameState, isMicrophoneAllowed, initAudio, startGame]);

  const handleSensitivityChange = (event) => { setBaseSoundThreshold(parseFloat(event.target.value)); };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-800 p-4">
      <h1 className="text-3xl font-bold text-white mb-2">Chicken Voice Mover</h1>
      {/* ... sensitivity slider ... same ... */}
       <div className="my-3 p-3 bg-gray-700 rounded-lg shadow">
        <label htmlFor="sensitivity" className="block text-sm font-medium text-gray-200 mb-1">
          Sound Sensitivity (Threshold: {baseSoundThreshold.toFixed(0)})
        </label>
        <input type="range" id="sensitivity" name="sensitivity" min="5" max="100" value={baseSoundThreshold}
          onChange={handleSensitivityChange} className="w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer"
          disabled={gameState === 'playing'} />
        <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>Softer Sounds Move/Jump</span>
            <span>Louder Sounds Move/Jump Higher</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
        className="border-4 border-gray-600 rounded-lg shadow-2xl bg-white"
        onClick={handleCanvasClick} />
      {/* ... messages ... */}
       {isMicrophoneAllowed === false && gameState !== 'loading' && (
        <p className="text-red-400 mt-4"> Mic access denied. Space/Click for small jump (no forward move).</p>
      )}
      <p className="text-gray-300 mt-2 text-sm">
        { gameState === 'loading' ? 'Loading...' :
          (gameState === 'ready' && isMicrophoneAllowed === null) ? 'Waiting for microphone...' :
          (isMicrophoneAllowed && gameState !== 'playing') ? 'Make soft sounds to walk, loud to jump & move! Click/Say Loudly to Start.' :
          isMicrophoneAllowed ? 'Make soft sounds to walk, loud sounds to jump further & higher!' :
          'Click/Space for small jump (no forward move). Mic not available.'}
      </p>
       <p className="text-xs text-gray-500 mt-1">Inspired by TikTok. Art & mechanics approximated.</p>
    </div>
  );
}