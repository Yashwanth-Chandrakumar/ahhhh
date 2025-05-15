// app/page.js
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Game Constants
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const CHICKEN_WIDTH = 50;
const CHICKEN_HEIGHT = 40;
const CHICKEN_INITIAL_X = 50; // Starting X position (left side)
const GRAVITY = 0.6;
// Sound-based movement constants
const MIN_JUMP_STRENGTH = -6; // Softest sound jump
const MAX_JUMP_STRENGTH = -16; // Loudest sound jump
// Movement constants
const MIN_MOVE_DISTANCE = 2; // Minimum forward movement on sound
const MAX_MOVE_DISTANCE = 8; // Maximum forward movement on loud sound
// No more automatic scrolling
// const SCROLL_SPEED = 3; // Removed constant

// Max expected average volume from analyser for scaling jump height.
// This might need tuning based on typical microphone levels.
const MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING = 100;


const COLOR_SKY = '#333366';
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

// const SOUND_THRESHOLD = 30; // Will be controlled by slider
const SMOOTHING_TIME_CONSTANT = 0.2;

export default function ChickenGamePage() {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const dataArrayRef = useRef(null);

  const [gameState, setGameState] = useState('loading');
  const [score, setScore] = useState(0);
  const [isMicrophoneAllowed, setIsMicrophoneAllowed] = useState(null);
  const [soundThreshold, setSoundThreshold] = useState(30); // Initial sensitivity

  const chickenRef = useRef({
    x: CHICKEN_INITIAL_X, // Add X position for horizontal movement
    y: CANVAS_HEIGHT - 150, // Start on a platform (ground level - platform height)
    vx: 0, // Add horizontal velocity
    vy: 0, 
    width: CHICKEN_WIDTH, 
    height: CHICKEN_HEIGHT,
    onGround: false, 
    bobOffset: 0, 
    bobDirection: 1,
  });
  const cameraXRef = useRef(0);
  const levelElementsRef = useRef([]);
  const confettiRef = useRef([]);
  const bridgeStateRef = useRef({ playerOnBridgePost: false, activePlanks: 0 });

  const spawnConfetti = useCallback(() => {
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
    let currentX = 0;
    elements.push({ type: 'platform', id: `p0`, x: currentX, y: CANVAS_HEIGHT - 100, width: 400, height: 100 });
    currentX += 400;
    elements.push({ type: 'gap', id: `g0`, width: 120 }); currentX += 120;
    elements.push({ type: 'platform', id: `p1`, x: currentX, y: CANVAS_HEIGHT - 100, width: 250, height: 100, hasSpike: true, spikeRelativeX: 100 });
    currentX += 250;
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
    elements.push({ type: 'shuriken_spawn', id: `s0`, x: currentX + 200, spawned: false });
    currentX += 400;
    elements.push({ type: 'gap', id: `g6`, width: 100 }); currentX += 100;
    elements.push({ type: 'warning_sign', id: `ws0`, x: currentX, y: CANVAS_HEIGHT - 300 });
    elements.push({ type: 'platform', id: `p7`, x: currentX, y: CANVAS_HEIGHT - 100, width: 150, height: 100 });
    currentX += 150;
    elements.push({ type: 'gap', id: `g7`, width: 80 }); currentX += 80;
    const bridgeStartX = currentX;
    elements.push({ type: 'bridge_post', id: `bp0`, x: bridgeStartX, y: CANVAS_HEIGHT - 200, width: 60, height: 200 });
    const bridgePlanks = [
        { relativeX: 60, yOffset: 0, width: 150, height: 30 },
        { relativeX: 60 + 150 + 20, yOffset: 0, width: 150, height: 30 },
        { relativeX: 60 + 150 + 20 + 150 + 20, yOffset: 0, width: 150, height: 30 },
    ];
    elements.push({ type: 'bridge_structure', id: `bs0`, x: bridgeStartX, y: CANVAS_HEIGHT - 200, planks: bridgePlanks, activePlanks: 0 });
    let approxBridgeWidth = 60; bridgePlanks.forEach((plank, index) => { approxBridgeWidth += plank.width; if (index < bridgePlanks.length -1) approxBridgeWidth += 20; });
    currentX += approxBridgeWidth;
    elements.push({ type: 'gap', id: `g8`, width: 80 }); currentX += 80;
    elements.push({ type: 'platform', id: `p8`, x: currentX, y: CANVAS_HEIGHT - 100, width: 300, height: 100 });
    currentX += 300;
    elements.push({ type: 'gap', id: `g9`, width: 100 }); currentX += 100;
    elements.push({ type: 'finish_line', id: `fl0`, x: currentX, y: CANVAS_HEIGHT - 150, width: 50, height: 150 });
    levelElementsRef.current = elements;
  }, []);

  const initAudio = useCallback(async () => {
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
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setIsMicrophoneAllowed(false);
    }
    setGameState('ready');
  }, [setIsMicrophoneAllowed, setGameState]); // Dependencies are stable state setters

  // Now returns an object: { detected: boolean, volume: number }
  const getSoundInfo = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || dataArrayRef.current.length === 0) {
      return { detected: false, volume: 0 };
    }
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    let sum = 0;
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i];
    }
    const averageVolume = sum / dataArrayRef.current.length;
    return {
      detected: averageVolume > soundThreshold, // Use state variable for threshold
      volume: averageVolume,
    };
  }, [soundThreshold]); // Depends on the soundThreshold state

  const resetGame = useCallback(() => {
    chickenRef.current = {
      x: CHICKEN_INITIAL_X, // Reset X position
      y: CANVAS_HEIGHT - 150, // Start on a platform (ground level - platform height)
      vx: 0, // Reset horizontal velocity
      vy: 0, 
      width: CHICKEN_WIDTH, 
      height: CHICKEN_HEIGHT,
      onGround: false, 
      bobOffset: 0, 
      bobDirection: 1,
    };
    cameraXRef.current = 0;
    setScore(0);
    confettiRef.current = [];
    bridgeStateRef.current = { playerOnBridgePost: false, activePlanks: 0 };
    generateLevel();
    levelElementsRef.current = levelElementsRef.current.map(el => {
        if (el.type === 'shuriken_spawn') return { ...el, spawned: false };
        if (el.type === 'bridge_structure') return { ...el, activePlanks: 0 };
        return el;
    }).filter(el => el.type !== 'shuriken_active' && el.type !== 'bridge_plank_active');
  }, [generateLevel, setScore]);

  const startGame = useCallback(() => {
    if (isMicrophoneAllowed === false) {
        alert("Microphone access was denied or failed. Use Spacebar to jump (fixed height).");
    }
    resetGame();
    setGameState('playing');
  }, [isMicrophoneAllowed, resetGame, setGameState]);

  const updateGame = useCallback(() => {
    const chicken = chickenRef.current;
    
    // Apply gravity
    chicken.vy += GRAVITY;
    chicken.y += chicken.vy;
    
    // Reset ground state
    chicken.onGround = false;

    // Bobbing animation when on ground (unchanged)
    if (chicken.onGround) { /* bobbing animation */ } else { chicken.bobOffset = 0; }

    // Get sound info for movement and jumping
    const soundInfo = getSoundInfo();
    
    // Check if sound is detected
    if (soundInfo.detected) {
      // Normalize volume: 0 for sound at threshold, 1 for sound at MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING
      const normalizedVolume = Math.min(1, Math.max(0, (soundInfo.volume - soundThreshold) / (MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING - soundThreshold)));
      
      // Move forward based on volume (even if not on ground)
      const moveDistance = MIN_MOVE_DISTANCE + normalizedVolume * (MAX_MOVE_DISTANCE - MIN_MOVE_DISTANCE);
      chicken.x += moveDistance;
      
      // Adjust camera to follow chicken
      if (chicken.x - cameraXRef.current > CANVAS_WIDTH / 2) {
        cameraXRef.current = chicken.x - CANVAS_WIDTH / 2;
      }
      
      // Jump only if on ground
      if (chicken.onGround) {
        // Interpolate jump strength
        chicken.vy = MIN_JUMP_STRENGTH + normalizedVolume * (MAX_JUMP_STRENGTH - MIN_JUMP_STRENGTH);
      }
    }

    // Calculate chicken position relative to the camera (for collision detection)
    const chickenScreenX = chicken.x - cameraXRef.current;
    const chickenRect = { x: chickenScreenX, y: chicken.y, width: chicken.width, height: chicken.height };
    let onAnySurface = false;

    levelElementsRef.current.forEach(element => {
      const elementScreenX = element.x - cameraXRef.current;
      if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') {
        const elRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
        if (chickenRect.x + chickenRect.width > elRect.x && chickenRect.x < elRect.x + elRect.width &&
            chickenRect.y + chickenRect.height > elRect.y && chickenRect.y + chickenRect.height < elRect.y + Math.max(chicken.vy,0) + 20 && chicken.vy >= 0) {
          chicken.y = elRect.y - chickenRect.height; chicken.vy = 0; chicken.onGround = true; onAnySurface = true;
          if (element.type === 'bridge_post') bridgeStateRef.current.playerOnBridgePost = true;
          else bridgeStateRef.current.playerOnBridgePost = false;
        }
        if (element.hasSpike) { /* spike collision */
            const spikeRect = { x: elRect.x + element.spikeRelativeX, y: elRect.y - 30, width: 30, height: 30 };
            if (chickenRect.x < spikeRect.x + spikeRect.width && chickenRect.x + chickenRect.width > spikeRect.x &&
                chickenRect.y < spikeRect.y + spikeRect.height && chickenRect.y + chickenRect.height > spikeRect.y) {
              setGameState('gameOver');
            }
        }
      } else if (element.type === 'shuriken_spawn' && !element.spawned) { /* shuriken spawn */
         if (elementScreenX < CANVAS_WIDTH && elementScreenX + 50 > 0) {
          levelElementsRef.current.push({
            type: 'shuriken_active', id: `sa-${element.id}-${Date.now()}`,
            x: element.x, // Use world X for shuriken movement logic
            y: Math.random() * (CANVAS_HEIGHT / 2) + 50, size: 30,
            speedX: -5, // Fixed speed now that we don't auto-scroll
            rotation: 0, active: true,
          });
          element.spawned = true;
        }
      } else if (element.type === 'shuriken_active') { /* shuriken move & collide */
        // Update shuriken position in world coordinates
        element.x += element.speedX;
        
        // Calculate screen position
        const shurikenScreenX = element.x - cameraXRef.current;
        element.rotation += 0.2;
        
        // Remove if off-screen left
        if (shurikenScreenX + element.size < 0) element.active = false;
        
        // Check collision
        const shurikenRect = { x: shurikenScreenX, y: element.y, width: element.size, height: element.size };
        if (chickenRect.x < shurikenRect.x + shurikenRect.width && chickenRect.x + chickenRect.width > shurikenRect.x &&
            chickenRect.y < shurikenRect.y + shurikenRect.height && chickenRect.y + chickenRect.height > shurikenRect.y) {
          setGameState('gameOver');
        }
      } else if (element.type === 'bridge_structure') { /* bridge logic */
        if (bridgeStateRef.current.playerOnBridgePost && element.activePlanks < element.planks.length) {
          const soundForBridge = getSoundInfo(); // Check sound specifically for bridge
          if (soundForBridge.detected || chicken.onGround) { 
            const newPlankIndex = element.activePlanks;
            const plankDef = element.planks[newPlankIndex];
            const plankId = `bpa-${element.id}-${newPlankIndex}`;
            if (!levelElementsRef.current.find(e => e.id === plankId)) {
              levelElementsRef.current.push({
                type: 'bridge_plank_active', id: plankId,
                x: element.x + plankDef.relativeX, y: element.y + plankDef.yOffset,
                width: plankDef.width, height: plankDef.height,
              });
              element.activePlanks++;
            }
          }
        }
      } else if (element.type === 'finish_line') { /* finish line collision */
          const finishRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
            if (chickenRect.x + chickenRect.width > finishRect.x && chickenRect.x < finishRect.x + finishRect.width &&
                chickenRect.y + chickenRect.height > finishRect.y && chickenRect.y < finishRect.y + finishRect.height) {
              setGameState('won');
              spawnConfetti();
            }
      }
    });
    levelElementsRef.current = levelElementsRef.current.filter(el => el.type !== 'shuriken_active' || el.active);

    if (chicken.y + chicken.height > CANVAS_HEIGHT - 50 && gameState !== 'gameOver' && gameState !== 'won') {
        setGameState('gameOver');
    }
    if (chicken.y > CANVAS_HEIGHT + chicken.height) { setGameState('gameOver'); }
    if (!onAnySurface && chicken.y < CANVAS_HEIGHT - 50 - chicken.height) chicken.onGround = false;
    
    // Only increment score if the player has moved
    if (gameState === 'playing') { 
      setScore(prevScore => prevScore + (chicken.x / 1000)); // Score based on distance
    }

  }, [getSoundInfo, setGameState, setScore, spawnConfetti, gameState, soundThreshold]);

  const updateConfetti = useCallback(() => { /* ... same ... */
    confettiRef.current.forEach(c => {
      c.y += c.speedY; c.swayCounter += 0.05; c.x += Math.sin(c.swayCounter) * c.sway;
      if (c.y > CANVAS_HEIGHT) { c.y = Math.random() * -100 - 20; c.x = Math.random() * CANVAS_WIDTH; }
    });
  }, []);

  const refinedDraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    
    // Background
    ctx.fillStyle = COLOR_SKY; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = COLOR_WATER; ctx.fillRect(0, CANVAS_HEIGHT - 50, CANVAS_WIDTH, 50);
    
    // Waves
    ctx.fillStyle = COLOR_WAVE;
    for (let i = 0; i < CANVAS_WIDTH / 30 + 2; i++) {
      const waveX = (i * 30 - (cameraXRef.current % 30)) % (CANVAS_WIDTH + 30) - 30;
      ctx.beginPath(); ctx.moveTo(waveX, CANVAS_HEIGHT - 45);
      ctx.quadraticCurveTo(waveX + 7.5, CANVAS_HEIGHT - 55, waveX + 15, CANVAS_HEIGHT - 45);
      ctx.quadraticCurveTo(waveX + 22.5, CANVAS_HEIGHT - 35, waveX + 30, CANVAS_HEIGHT - 45);
      ctx.fill();
    }

    // Draw level elements
    levelElementsRef.current.forEach(element => {
      const elementScreenX = element.x - cameraXRef.current;
      if (elementScreenX + (element.width || element.size || 50) < 0 || elementScreenX > CANVAS_WIDTH) return;
      if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') { /* platform/bridge drawing */
        ctx.fillStyle = COLOR_PLATFORM_DIRT; ctx.fillRect(elementScreenX, element.y, element.width, element.height);
        if (element.type === 'platform') { ctx.fillStyle = COLOR_PLATFORM_GRASS; ctx.fillRect(elementScreenX, element.y, element.width, 20); }
        else if (element.type === 'bridge_plank_active') { ctx.fillStyle = COLOR_BRIDGE_PLANK; ctx.fillRect(elementScreenX, element.y, element.width, element.height); }
        if (element.hasSpike) { /* spike drawing */
            const spikeWidth = 30, spikeHeight = 30; const spikeX = elementScreenX + element.spikeRelativeX; const spikeY = element.y - spikeHeight;
            ctx.fillStyle = COLOR_SPIKE; ctx.beginPath(); ctx.moveTo(spikeX, spikeY + spikeHeight); ctx.lineTo(spikeX + spikeWidth / 2, spikeY); ctx.lineTo(spikeX + spikeWidth, spikeY + spikeHeight); ctx.closePath(); ctx.fill();
        }
      } else if (element.type === 'shuriken_active') { /* shuriken drawing */
          const shurikenScreenX = element.x - cameraXRef.current; // Use calculated screen X
          ctx.save(); ctx.translate(shurikenScreenX + element.size / 2, element.y + element.size / 2); ctx.rotate(element.rotation);
          ctx.fillStyle = '#555555'; ctx.strokeStyle = '#333333'; ctx.lineWidth = 2; const armLength = element.size / 2; ctx.beginPath();
          for (let j = 0; j < 4; j++) { ctx.moveTo(0,0); ctx.lineTo(armLength * Math.cos(Math.PI/2 * j), armLength * Math.sin(Math.PI/2*j)); ctx.lineTo(armLength/2 * Math.cos(Math.PI/2 * j + Math.PI/4), armLength/2 * Math.sin(Math.PI/2*j + Math.PI/4)); }
          ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      } else if (element.type === 'warning_sign') { /* warning sign drawing */
           const signSize = 50; ctx.fillStyle = '#FFCC00'; ctx.beginPath(); ctx.moveTo(elementScreenX + signSize / 2, element.y); ctx.lineTo(elementScreenX + signSize, element.y + signSize * 0.866); ctx.lineTo(elementScreenX, element.y + signSize * 0.866); ctx.closePath(); ctx.fill();
           ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#000000'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.fillText('!', elementScreenX + signSize / 2, element.y + signSize * 0.65);
      } else if (element.type === 'finish_line') { /* finish line drawing */
          const poleWidth = 10; ctx.fillStyle = '#777777'; ctx.fillRect(elementScreenX, element.y, poleWidth, element.height);
          const squareSize = 10; for (let r = 0; r < 3; r++) { for (let c = 0; c < 5; c++) { ctx.fillStyle = (r + c) % 2 === 0 ? FINISH_LINE_COLOR_PRIMARY : FINISH_LINE_COLOR_SECONDARY; ctx.fillRect(elementScreenX + poleWidth + c * squareSize, element.y + r * squareSize, squareSize, squareSize); } }
      }
    });
    
    // Draw chicken at its screen position
    const ch = chickenRef.current; 
    const chickenDrawY = ch.y + ch.bobOffset;
    const chickenScreenX = ch.x - cameraXRef.current; // Calculate screen X position
    
    // Draw chicken body
    ctx.fillStyle = COLOR_CHICKEN_BODY; 
    ctx.beginPath(); 
    ctx.ellipse(chickenScreenX + ch.width / 2, chickenDrawY + ch.height / 2, ch.width / 2, ch.height / 2, 0, 0, 2 * Math.PI); 
    ctx.fill();
    
    // Draw chicken comb
    ctx.fillStyle = COLOR_CHICKEN_COMB; 
    ctx.beginPath(); 
    ctx.ellipse(chickenScreenX + ch.width / 2, chickenDrawY + 5, 10, 8, 0, Math.PI, 2 * Math.PI); 
    ctx.fillRect(chickenScreenX + ch.width / 2 - 5, chickenDrawY + 5, 10, 5); 
    ctx.fill();
    
    // Draw beak
    ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS; 
    ctx.beginPath(); 
    ctx.moveTo(chickenScreenX + ch.width, chickenDrawY + ch.height / 2); 
    ctx.lineTo(chickenScreenX + ch.width + 15, chickenDrawY + ch.height / 2 + 5); 
    ctx.lineTo(chickenScreenX + ch.width, chickenDrawY + ch.height / 2 + 10); 
    ctx.closePath(); 
    ctx.fill();
    
    // Draw eye
    ctx.fillStyle = '#000000'; 
    ctx.beginPath(); 
    ctx.arc(chickenScreenX + ch.width * 0.75, chickenDrawY + ch.height * 0.35, 3, 0, 2 * Math.PI); 
    ctx.fill();
    
    // Draw legs
    if (chickenDrawY + ch.height < CANVAS_HEIGHT - 50 - 5) { 
      ctx.strokeStyle = COLOR_CHICKEN_BEAK_LEGS; 
      ctx.lineWidth = 4; 
      ctx.beginPath(); 
      ctx.moveTo(chickenScreenX + ch.width * 0.3, chickenDrawY + ch.height); 
      ctx.lineTo(chickenScreenX + ch.width * 0.3, chickenDrawY + ch.height + 10); 
      ctx.moveTo(chickenScreenX + ch.width * 0.6, chickenDrawY + ch.height); 
      ctx.lineTo(chickenScreenX + ch.width * 0.6, chickenDrawY + ch.height + 10); 
      ctx.stroke(); 
    }

    /* UI (Timer, Mic Icon) ... same ... */
    ctx.fillStyle = COLOR_TEXT; ctx.font = '24px Arial'; ctx.textAlign = 'left';
    const micX = 20, micY = 30; ctx.fillRect(micX, micY - 10, 10, 20); ctx.beginPath(); ctx.arc(micX + 5, micY - 10, 8, Math.PI, 2 * Math.PI); ctx.fill(); ctx.fillRect(micX + 2, micY + 10, 6, 10);
    ctx.fillText(`${score.toFixed(2)}`, 70, 40);

    // Rest of UI drawing remains the same
    if (gameState === 'gameOver') { /* game over screen ... same ... */
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); ctx.fillStyle = COLOR_TEXT; ctx.font = '48px Arial'; ctx.textAlign = 'center';
        ctx.fillText('Game Over!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30); ctx.font = '24px Arial';
        ctx.fillText(`Score: ${score.toFixed(2)}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20); ctx.fillText('Click or Say Something to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    } else if (gameState === 'won') { /* won screen ... same ... */
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
        ctx.font = '24px Arial'; ctx.fillText(`Final Score: ${score.toFixed(2)}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90); ctx.fillText('Click or Say Something to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 130);
    } else if (gameState === 'ready') { /* ready screen ... same ... */
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); ctx.fillStyle = COLOR_TEXT; ctx.font = '30px Arial'; ctx.textAlign = 'center';
        if (isMicrophoneAllowed === null) { ctx.fillText('Requesting microphone...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); }
        else if (isMicrophoneAllowed === false) { ctx.fillText('Mic denied. Click/Space to Start.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); }
        else { ctx.fillText('Click or Say Loudly to Start!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); }
    }
  }, [gameState, score, isMicrophoneAllowed, updateConfetti]);

  useEffect(() => {
    generateLevel();
    if (isMicrophoneAllowed === null && !audioContextRef.current) { initAudio(); }
    const handleKeyPress = (e) => {
        if (e.code === 'Space') { 
            if (gameState === 'playing') {
                // Move forward slightly on spacebar
                chickenRef.current.x += (MIN_MOVE_DISTANCE + MAX_MOVE_DISTANCE) / 2;
                
                // Adjust camera to follow chicken if needed
                if (chickenRef.current.x - cameraXRef.current > CANVAS_WIDTH / 2) {
                    cameraXRef.current = chickenRef.current.x - CANVAS_WIDTH / 2;
                }
                
                // Medium jump if on ground
                if (chickenRef.current.onGround) {
                    chickenRef.current.vy = (MIN_JUMP_STRENGTH + MAX_JUMP_STRENGTH) / 2;
                }
            } else if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
                startGame();
            }
        }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => { /* cleanup ... same ... */
        window.removeEventListener('keydown', handleKeyPress);
        if (microphoneStreamRef.current) { microphoneStreamRef.current.getTracks().forEach(track => track.stop()); }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') { audioContextRef.current.close().catch(e => console.error("Error closing audio context", e)); audioContextRef.current = null; }
    };
  }, [generateLevel, initAudio, startGame, gameState, isMicrophoneAllowed]);

  useEffect(() => {
    let animationFrameId;
    const gameLoop = () => {
      if (gameState === 'playing') { updateGame(); }
      refinedDraw();
      animationFrameId = requestAnimationFrame(gameLoop);
    };
    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, updateGame, refinedDraw]);

  const handleCanvasClick = useCallback(() => {
    if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
      if (isMicrophoneAllowed === null && !audioContextRef.current) { initAudio(); }
      else { startGame(); }
    } else if (gameState === 'playing') {
      // Move forward slightly on click
      chickenRef.current.x += (MIN_MOVE_DISTANCE + MAX_MOVE_DISTANCE) / 2;
      
      // Adjust camera to follow chicken if needed
      if (chickenRef.current.x - cameraXRef.current > CANVAS_WIDTH / 2) {
          cameraXRef.current = chickenRef.current.x - CANVAS_WIDTH / 2;
      }
      
      // Medium jump if on ground
      if (chickenRef.current.onGround) {
          chickenRef.current.vy = (MIN_JUMP_STRENGTH + MAX_JUMP_STRENGTH) / 2;
      }
    }
  }, [gameState, isMicrophoneAllowed, initAudio, startGame]);

  const handleSensitivityChange = (event) => {
    setSoundThreshold(parseFloat(event.target.value));
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-800 p-4">
      <h1 className="text-3xl font-bold text-white mb-2">Chicken Voice Run</h1>
      <h3 className="text-xl text-yellow-300 mb-1">{'OMG! Jeg klarte det på første forsøket 🥰😍 så lett!!'}</h3>
      
      <div className="my-3 p-3 bg-gray-700 rounded-lg shadow">
        <label htmlFor="sensitivity" className="block text-sm font-medium text-gray-200 mb-1">
          Sound Sensitivity (Threshold: {soundThreshold.toFixed(0)})
        </label>
        <input
          type="range"
          id="sensitivity"
          name="sensitivity"
          min="5" // Min threshold
          max="100" // Max threshold
          value={soundThreshold}
          onChange={handleSensitivityChange}
          className="w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer"
          disabled={gameState === 'playing'} // Optionally disable during gameplay
        />
        <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>More Sensitive</span>
            <span>Less Sensitive</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border-4 border-gray-600 rounded-lg shadow-2xl bg-white"
        onClick={handleCanvasClick}
      />
      
      {isMicrophoneAllowed === false && gameState !== 'loading' && (
        <p className="text-red-400 mt-4">
          Microphone access was denied or failed. You can use SPACEBAR/Click to move and jump.
        </p>
      )}
      <p className="text-gray-300 mt-2 text-sm">
        { gameState === 'loading' ? 'Loading...' :
          (gameState === 'ready' && isMicrophoneAllowed === null) ? 'Waiting for microphone permission...' :
          (isMicrophoneAllowed && gameState !== 'playing') ? 'Make sounds to move forward! Louder sounds = move faster and jump higher!' :
          isMicrophoneAllowed ? 'Make sounds to move forward! Soft sounds move a little, loud sounds move further and jump higher!' :
          'Click/Space to move forward and jump. (Mic not available)'}
      </p>
       <p className="text-xs text-gray-500 mt-1">Game inspired by TikTok video. Art and mechanics are approximations.</p>
    </div>
  );
}