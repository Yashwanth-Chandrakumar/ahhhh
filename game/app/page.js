// app/page.js
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// Game Constants (ensure all are defined here as before)
const CANVAS_WIDTH = 800; /* ... */
const CANVAS_HEIGHT = 600;
const CHICKEN_WIDTH = 50; // This is the bounding box width
const CHICKEN_HEIGHT = 40; // This is the bounding box height. The chicken drawing might appear taller.
const CHICKEN_INITIAL_WORLD_X = 100;
const CAMERA_FOLLOW_X_OFFSET = CANVAS_WIDTH / 3;
const GRAVITY = 0.6;
const MIN_JUMP_STRENGTH = -6;
const MAX_JUMP_STRENGTH = -16;
const WALK_SPEED = 3;
const JUMP_FORWARD_SPEED = 4;
const JUMP_ACTIVATION_VOLUME_OFFSET = 20;
const MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING = 100;
const COLOR_SKY = '#333366';
const COLOR_WATER = '#0077BE';
const COLOR_WAVE = '#FFFFFF';
const COLOR_PLATFORM_GRASS = '#5cb85c';
const COLOR_PLATFORM_DIRT = '#8B4513';
const COLOR_CHICKEN_BODY = '#FFFFFF';
const COLOR_CHICKEN_COMB = '#FF0000';
const COLOR_CHICKEN_BEAK_LEGS = '#FFFF00'; // Yellow for beak, legs, tail
const COLOR_SPIKE = '#A9A9A9';
const COLOR_BRIDGE_PLANK = '#A0522D';
const COLOR_TEXT = '#FFFFFF';
const COLOR_TROPHY = '#FFD700';
const FINISH_LINE_COLOR_PRIMARY = '#000000';
const FINISH_LINE_COLOR_SECONDARY = '#FFFFFF';
const SMOOTHING_TIME_CONSTANT = 0.2;

// New colors for lushness
const COLOR_SKY_TOP = '#70A1FF'; // Lighter blue for top of sky gradient
const COLOR_SKY_BOTTOM = '#3366CC'; // Darker blue for bottom of sky gradient (original was #333366)
const COLOR_DISTANT_HILL_1 = '#6AAA64'; // Muted green for far hills
const COLOR_DISTANT_HILL_2 = '#5C9A58'; // Slightly darker muted green

export default function ChickenGamePage() {
  const canvasRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const dataArrayRef = useRef(null);
  const audioElementRef = useRef(null);
  const audioFileSourceRef = useRef(null);

  const [gameState, setGameState] = useState('loading');
  const [score, setScore] = useState(0);
  const [isMicrophoneAllowed, setIsMicrophoneAllowed] = useState(null);
  const [baseSoundThreshold, setBaseSoundThreshold] = useState(30);
  const [useAudioFile, setUseAudioFile] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);

  const chickenRef = useRef({
    worldX: CHICKEN_INITIAL_WORLD_X, y: CANVAS_HEIGHT - 100 - CHICKEN_HEIGHT,
    vy: 0, width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT,
    onGround: true, bobOffset: 0, bobDirection: 1,
    wingPhase: 0, // For wing/tail animation
    legPhase: 0,  // For leg animation
    lastMoveX: 0, // To detect horizontal movement
    debugVx: 0 // Horizontal velocity for debug mode
  });
  const cameraXRef = useRef(0);
  const levelElementsRef = useRef([]);
  const confettiRef = useRef([]);
  const bridgeStateRef = useRef({ playerOnBridgePost: false, activePlanks: 0 });

  const initAudio = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      console.log("AudioContext already exists or is initializing. Current state:", audioContextRef.current.state);
      return;
    }
    console.log("Initializing new AudioContext...");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      const context = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = context;
      console.log("AudioContext created. Initial state:", context.state);

      const analyser = context.createAnalyser();
      analyserRef.current = analyser;
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      analyser.fftSize = 256;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
      setIsMicrophoneAllowed(true);
      console.log("Microphone access granted and audio initialized.");
    } catch (err) {
      console.error("Error initializing audio or accessing microphone:", err);
      setIsMicrophoneAllowed(false);
    }
  }, [setIsMicrophoneAllowed]);

  const ensureAudioContextRunning = useCallback(async () => {
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      console.log("AudioContext not initialized or closed, attempting to re-initialize.");
      await initAudio();
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        console.log("AudioContext is suspended, attempting to resume...");
        try {
          await audioContextRef.current.resume();
          console.log('AudioContext resumed successfully. New state:', audioContextRef.current.state);
          return true;
        } catch (e) {
          console.error('Failed to resume AudioContext:', e);
          setIsMicrophoneAllowed(false);
          alert('Could not start audio. Please check microphone permissions and try again.');
          setGameState('ready');
          return false;
        }
      } else if (audioContextRef.current.state === 'running') {
        return true;
      } else {
        console.warn('AudioContext in unexpected state:', audioContextRef.current.state);
        return false;
      }
    }
    console.error("AudioContext could not be initialized or started.");
    setIsMicrophoneAllowed(false);
    return false;
  }, [initAudio, setIsMicrophoneAllowed, setGameState]);


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
    const elements = []; let currentX = 0;
    // Start: Initial platform
    elements.push({ type: 'platform', id: `p0`, x: currentX, y: CANVAS_HEIGHT - 100, width: CHICKEN_INITIAL_WORLD_X + 300, height: 100 });
    currentX += CHICKEN_INITIAL_WORLD_X + 300;

    // Gap and platform with spike
    elements.push({ type: 'gap', id: `g0`, width: 120 }); currentX += 120;
    elements.push({ type: 'platform', id: `p1`, x: currentX, y: CANVAS_HEIGHT - 100, width: 250, height: 100, hasSpike: true, spikeRelativeX: 100 });
    currentX += 250;

    // Gap and slightly higher platform
    elements.push({ type: 'gap', id: `g1`, width: 100 }); currentX += 100;
    elements.push({ type: 'platform', id: `p2`, x: currentX, y: CANVAS_HEIGHT - 150, width: 200, height: 150 });
    currentX += 200;

    // Gap and another platform at standard height
    elements.push({ type: 'gap', id: `g2`, width: 120 }); currentX += 120; // Slightly reduced gap from 150
    elements.push({ type: 'platform', id: `p3`, x: currentX, y: CANVAS_HEIGHT - 100, width: 300, height: 100 });
    currentX += 300;

    // Gap and a TALLER platform (p4). Make this jump achievable.
    // Previous platform p3 is at y = CANVAS_HEIGHT - 100.
    // p4 is at y = CANVAS_HEIGHT - 250 (150px higher).
    elements.push({ type: 'gap', id: `g3`, width: 70 }); currentX += 70; // Reduced gap from 80
    elements.push({ type: 'platform', id: `p4`, x: currentX, y: CANVAS_HEIGHT - 220, width: 80, height: 220 }); // Made p4 slightly lower (less high) and thus taller
    currentX += 80;

    // Gap and another TALL platform (p5). Jump from p4 to p5.
    // p4 is at y = CANVAS_HEIGHT - 220.
    // p5 is at y = CANVAS_HEIGHT - 200 (20px lower than p4).
    elements.push({ type: 'gap', id: `g4`, width: 120 }); currentX += 120; // Reduced gap from 180 significantly
    elements.push({ type: 'platform', id: `p5`, x: currentX, y: CANVAS_HEIGHT - 200, width: 80, height: 200 });
    currentX += 80;

    // Gap and a long platform with shuriken spawn
    elements.push({ type: 'gap', id: `g5`, width: 100 }); currentX += 100;
    elements.push({ type: 'platform', id: `p6`, x: currentX, y: CANVAS_HEIGHT - 100, width: 400, height: 100 });
    elements.push({ type: 'shuriken_spawn', id: `s0`, x: currentX + 150, spawned: false }); // Earlier spawn
    elements.push({ type: 'shuriken_spawn', id: `s1`, x: currentX + 300, spawned: false }); // Second spawn on same platform
    currentX += 400;

    // Gap, warning, and platform before bridge
    elements.push({ type: 'gap', id: `g6`, width: 100 }); currentX += 100;
    elements.push({ type: 'warning_sign', id: `ws0`, x: currentX, y: CANVAS_HEIGHT - 300 });
    elements.push({ type: 'platform', id: `p7`, x: currentX, y: CANVAS_HEIGHT - 100, width: 150, height: 100 });
    elements.push({ type: 'shuriken_spawn', id: `s2`, x: currentX + 75, yOffset: -80, spawned: false }); // Shuriken above this platform
    currentX += 150;

    // Gap and bridge
    elements.push({ type: 'gap', id: `g7`, width: 80 }); currentX += 80;
    const bridgeStartX = currentX;
    elements.push({ type: 'bridge_post', id: `bp0`, x: bridgeStartX, y: CANVAS_HEIGHT - 200, width: 60, height: 200 });
    
    // New Falling Bridge
    const fallingBridgePlanks = [
        { id: 'fb0-p0', relativeX: 60, yOffset: 0, width: 100, height: 25, state: 'stable', fallTimer: 0, originalY: CANVAS_HEIGHT - 200 },
        { id: 'fb0-p1', relativeX: 60 + 100 + 15, yOffset: -5, width: 100, height: 25, state: 'stable', fallTimer: 0, originalY: CANVAS_HEIGHT - 200 -5 }, // Slightly offset
        { id: 'fb0-p2', relativeX: 60 + 100 + 15 + 100 + 15, yOffset: 0, width: 100, height: 25, state: 'stable', fallTimer: 0, originalY: CANVAS_HEIGHT - 200 },
        { id: 'fb0-p3', relativeX: 60 + 100 + 15 + 100 + 15 + 100 + 15, yOffset: 5, width: 100, height: 25, state: 'stable', fallTimer: 0, originalY: CANVAS_HEIGHT - 200 + 5},
    ];
    elements.push({ 
        type: 'falling_bridge_structure', 
        id: `fbs0`, 
        x: bridgeStartX, 
        // y will be derived from planks originalY
        planks: fallingBridgePlanks 
    });
    let approxFallingBridgeWidth = 60; // for the initial post
    fallingBridgePlanks.forEach((plank, index) => { 
        approxFallingBridgeWidth += plank.width; 
        if (index < fallingBridgePlanks.length -1) approxFallingBridgeWidth += 15; // gap between planks
    });
    elements.push({ type: 'shuriken_spawn', id: `s3`, x: bridgeStartX + approxFallingBridgeWidth / 2, yOffset: -120, spawned: false }); // Shuriken above falling bridge middle
    currentX += approxFallingBridgeWidth;
    elements.push({ type: 'bridge_post', id: `bp1`, x: currentX -15 , y: CANVAS_HEIGHT - 200, width: 60, height: 200 }); // End post for falling bridge
    currentX += (60-15); // Account for end post width

    elements.push({ type: 'gap', id: `g8`, width: 80 }); currentX += 80;
    elements.push({ type: 'platform', id: `p8`, x: currentX, y: CANVAS_HEIGHT - 100, width: 300, height: 100 });
    currentX += 300;

    // Gap and finish line
    elements.push({ type: 'gap', id: `g9`, width: 100 }); currentX += 100;
    elements.push({ type: 'finish_line', id: `fl0`, x: currentX, y: CANVAS_HEIGHT - 150, width: 50, height: 150 });
    levelElementsRef.current = elements;
  }, []);

  const getSoundInfo = useCallback(() => {
    if (!analyserRef.current || !dataArrayRef.current || dataArrayRef.current.length === 0 ||
        !audioContextRef.current || audioContextRef.current.state !== 'running') {
      return { detected: false, volume: 0 };
    }
    analyserRef.current.getByteFrequencyData(dataArrayRef.current);
    let sum = 0; for (let i = 0; i < dataArrayRef.current.length; i++) { sum += dataArrayRef.current[i]; }
    const averageVolume = sum / dataArrayRef.current.length;
    const effectiveThreshold = 105 - baseSoundThreshold;
    return { detected: averageVolume > effectiveThreshold, volume: averageVolume };
  }, [baseSoundThreshold]);

  const resetGame = useCallback(() => {
    chickenRef.current = {
        worldX: CHICKEN_INITIAL_WORLD_X, y: CANVAS_HEIGHT - 100 - CHICKEN_HEIGHT,
        vy: 0, width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT,
        onGround: true, bobOffset: 0, bobDirection: 1,
        wingPhase: 0, legPhase: 0, lastMoveX: 0, debugVx: 0 // Reset animation phases and debugVx
    };
    cameraXRef.current = 0; setScore(0); confettiRef.current = [];
    bridgeStateRef.current = { playerOnBridgePost: false, activePlanks: 0 };
    generateLevel();
    levelElementsRef.current = levelElementsRef.current.map(el => { if (el.type === 'shuriken_spawn') return { ...el, spawned: false }; if (el.type === 'bridge_structure') return { ...el, activePlanks: 0 }; return el; }).filter(el => el.type !== 'shuriken_active' && el.type !== 'bridge_plank_active');
  }, [generateLevel, setScore]);

  const startGame = useCallback(async () => {
    console.log("Attempting to start game...");
    const audioReady = await ensureAudioContextRunning();
    if (!audioReady) {
      console.log("Audio not ready, cannot start game.");
      return;
    }
    if (isMicrophoneAllowed === false) {
      alert("Microphone access was denied. Use Spacebar/Click for small jump (no forward movement).");
    }
    resetGame();
    setGameState('playing');
    console.log("Game state set to playing.");
  }, [ensureAudioContextRunning, isMicrophoneAllowed, resetGame, setGameState]);

  // ***** MODIFIED updateGame *****
  const updateGame = useCallback(() => {
    const chicken = chickenRef.current;
    const wasOnGround = chicken.onGround;
    const previousX = chicken.worldX;

    chicken.vy += GRAVITY;
    chicken.y += chicken.vy;
    chicken.onGround = false; // Assume airborne, collision detection will correct this

    const soundInfo = getSoundInfo();
    const effectiveThreshold = 105 - baseSoundThreshold;
    const JUMP_ACTIVATION_VOLUME_OFFSET_SCALED = JUMP_ACTIVATION_VOLUME_OFFSET * (effectiveThreshold / 50);

    window.lastSoundVolume = soundInfo.volume;
    window.effectiveThreshold = effectiveThreshold;
    window.jumpThreshold = effectiveThreshold + JUMP_ACTIVATION_VOLUME_OFFSET_SCALED;

    if (isDebugMode) {
        if (chicken.debugVx !== 0) {
            chicken.worldX += chicken.debugVx;
        }
    }

    // --- Start of Movement Logic ---
    // Determine horizontal movement and initiate sound-based jumps
    if (isDebugMode && chicken.debugVx !== 0) {
        // Case 1: Debug mode AND horizontal arrow keys are active.
        chicken.worldX += chicken.debugVx;
    } else {
        // Case 2: EITHER not in debug mode OR (in debug mode AND no horizontal arrow keys active, i.e. chicken.debugVx === 0).
        // Sound (from mic or audio file) controls movement.
        if (soundInfo.volume > effectiveThreshold + JUMP_ACTIVATION_VOLUME_OFFSET_SCALED) {
            if (wasOnGround) { // Sound initiates a jump
                const normalizedVolume = Math.min(1, Math.max(0,
                    (soundInfo.volume - (effectiveThreshold + JUMP_ACTIVATION_VOLUME_OFFSET_SCALED)) /
                    (MAX_EXPECTED_VOLUME_FOR_JUMP_SCALING - (effectiveThreshold + JUMP_ACTIVATION_VOLUME_OFFSET_SCALED))
                ));
                chicken.vy = MIN_JUMP_STRENGTH + normalizedVolume * (MAX_JUMP_STRENGTH - MIN_JUMP_STRENGTH);
            }
            chicken.worldX += JUMP_FORWARD_SPEED; // Sound-driven forward movement
        } else if (soundInfo.volume > effectiveThreshold) {
            if (wasOnGround) { // Sound initiates a small hop for walk
                chicken.vy = MIN_JUMP_STRENGTH / 1.5;
            }
            chicken.worldX += WALK_SPEED; // Sound-driven walk movement
        }
    }
    // --- End of Movement Logic ---

    // Update animation phases
    chicken.lastMoveX = chicken.worldX - previousX; // This should be after ALL worldX modifications

    let wingFlapSpeed; // This is the single, correct declaration
    if (!chicken.onGround) {
        wingFlapSpeed = 0.35; // Faster flap in air
    } else if (Math.abs(chicken.lastMoveX) > 0.1) {
        wingFlapSpeed = 0.20; // Medium flap when walking
    } else {
        wingFlapSpeed = 0.08; // Slow subtle flap when idle
    }
    chicken.wingPhase = (chicken.wingPhase + wingFlapSpeed) % (2 * Math.PI);

    if (chicken.onGround && Math.abs(chicken.lastMoveX) > 0.1) {
      const legStepSpeed = 0.35;
      chicken.legPhase = (chicken.legPhase + legStepSpeed) % (2 * Math.PI);
    }

    const desiredCameraX = chicken.worldX - CAMERA_FOLLOW_X_OFFSET;
    cameraXRef.current += (desiredCameraX - cameraXRef.current) * 0.1;
    if (cameraXRef.current < 0) cameraXRef.current = 0;

    const chickenScreenX_collision = chicken.worldX - cameraXRef.current;
    const chickenRect = { x: chickenScreenX_collision, y: chicken.y, width: chicken.width, height: chicken.height };
    let onAnySurface = false;

    for (let i = levelElementsRef.current.length - 1; i >= 0; i--) {
        const element = levelElementsRef.current[i];
        if (!element) continue; // Should not happen, but good practice
        const elementScreenX = element.x - cameraXRef.current;

        if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') {
            const elRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
            if (chickenRect.x + chickenRect.width > elRect.x &&
                chickenRect.x < elRect.x + elRect.width &&
                chickenRect.y + chickenRect.height > elRect.y &&
                chickenRect.y + chickenRect.height < elRect.y + Math.max(chicken.vy, 0) + 20 &&
                chicken.vy >= 0) {
                chicken.y = elRect.y - chickenRect.height;
                chicken.vy = 0;
                chicken.onGround = true;
                onAnySurface = true;
                if (element.type === 'bridge_post') bridgeStateRef.current.playerOnBridgePost = true;
                else bridgeStateRef.current.playerOnBridgePost = false;
            }
            if (element.hasSpike) {
                const spikeRect = { x: elRect.x + element.spikeRelativeX, y: elRect.y - 30, width: 30, height: 30 };
                if (chickenRect.x < spikeRect.x + spikeRect.width && chickenRect.x + chickenRect.width > spikeRect.x &&
                    chickenRect.y < spikeRect.y + spikeRect.height && chickenRect.y + chickenRect.height > spikeRect.y) {
                    console.log("Game Over: Spike collision with element:", JSON.stringify(element), "Chicken:", JSON.stringify(chickenRect));
                    setGameState('gameOver');
                    return; // Early exit if game over
                }
            }
        } else if (element.type === 'shuriken_spawn' && !element.spawned) {
            if (element.x - cameraXRef.current < CANVAS_WIDTH + 100 && element.x - cameraXRef.current > -100) {
                levelElementsRef.current.push({
                    type: 'shuriken_active', id: `sa-${element.id}-${Date.now()}`,
                    worldX: element.x + Math.random() * 50 - 25,
                    y: element.yOffset ? (CANVAS_HEIGHT - 100 + element.yOffset) : (Math.random() * (CANVAS_HEIGHT / 2) + 50),
                    size: 30, 
                    speedX_world: -(WALK_SPEED + 1 + Math.random() * 2),
                    rotation: 0, active: true,
                });
                element.spawned = true;
            }
        } else if (element.type === 'shuriken_active') {
            element.worldX += element.speedX_world;
            const shurikenScreenX = element.worldX - cameraXRef.current;
            element.rotation += 0.2;
            if (shurikenScreenX + element.size < -50) element.active = false;
            const shurikenRect = { x: shurikenScreenX, y: element.y, width: element.size, height: element.size };
            if (chickenRect.x < shurikenRect.x + shurikenRect.width && chickenRect.x + chickenRect.width > shurikenRect.x &&
                chickenRect.y < shurikenRect.y + shurikenRect.height && chickenRect.y + chickenRect.height > shurikenRect.y) {
                console.log("Game Over: Shuriken collision with element:", JSON.stringify(element), "Chicken:", JSON.stringify(chickenRect));
                setGameState('gameOver');
                return; // Early exit
            }
        } else if (element.type === 'bridge_structure') {
            if (bridgeStateRef.current.playerOnBridgePost && element.activePlanks < element.planks.length) {
                const soundForBridge = getSoundInfo();
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
        } else if (element.type === 'finish_line') {
            const finishRect = { x: elementScreenX, y: element.y, width: element.width, height: element.height };
            if (chickenRect.x + chickenRect.width > finishRect.x && chickenRect.x < finishRect.x + finishRect.width &&
                chickenRect.y + chickenRect.height > finishRect.y && chickenRect.y < finishRect.y + finishRect.height) {
                setGameState('won');
                spawnConfetti();
                return; // Early exit
            }
        }
    } // Correct closing brace for the main collision for-loop

    // Handle falling bridge planks separately
    if (gameState === 'playing') { // Only process if still playing
        levelElementsRef.current.forEach(element => {
            if (element.type === 'falling_bridge_structure') {
                element.planks.forEach(plank => {
                    if (plank.state === 'fallen') return;
                    const plankWorldX = element.x + plank.relativeX;
                    const plankScreenX = plankWorldX - cameraXRef.current;
                    const plankRect = { x: plankScreenX, y: plank.originalY + plank.yOffset, width: plank.width, height: plank.height };

                    if (plank.state !== 'falling' &&
                        chickenRect.x + chickenRect.width > plankRect.x &&
                        chickenRect.x < plankRect.x + plankRect.width &&
                        chickenRect.y + chickenRect.height > plankRect.y &&
                        chickenRect.y + chickenRect.height < plankRect.y + Math.max(chicken.vy, 0) + 10 &&
                        chicken.vy >= 0) {
                        chicken.y = plankRect.y - chickenRect.height;
                        chicken.vy = 0;
                        chicken.onGround = true;
                        onAnySurface = true;
                        bridgeStateRef.current.playerOnBridgePost = false;
                        if (plank.state === 'stable') {
                            plank.state = 'wiggling';
                            plank.fallTimer = 30;
                        }
                    }
                    if (plank.state === 'wiggling') {
                        plank.fallTimer--;
                        if (plank.fallTimer <= 0) plank.state = 'falling';
                    }
                    if (plank.state === 'falling') {
                        plank.yOffset += 8;
                        if (plank.originalY + plank.yOffset > CANVAS_HEIGHT) plank.state = 'fallen';
                    }
                });
            }
        });
    }
    
    levelElementsRef.current = levelElementsRef.current.filter(el => {
        if (el.type === 'shuriken_active') return el.active;
        return true;
    });

    if (gameState === 'playing') { // Check again before these game-over conditions
        if (chicken.y + chicken.height >= CANVAS_HEIGHT - 50) { // Fell into water (using >=)
            console.log("Game Over: Fell into water. Chicken y:", chicken.y, "vy:", chicken.vy, "onGround:", chicken.onGround, "Feet at:", chicken.y + chicken.height, "Water line:", CANVAS_HEIGHT - 50);
            setGameState('gameOver');
            return;
        }
        if (chicken.y > CANVAS_HEIGHT + chicken.height) { // Fell completely off screen
            console.log("Game Over: Fell completely off screen. Chicken y:", chicken.y, "vy:", chicken.vy, "onGround:", chicken.onGround);
            setGameState('gameOver');
            return;
        }
    }

    if (!onAnySurface && chicken.y < CANVAS_HEIGHT - 50 - chicken.height) {
        chicken.onGround = false;
    }

    if (gameState === 'playing') {
        setScore(chicken.worldX / 100);
    }
  }, [getSoundInfo, baseSoundThreshold, setGameState, setScore, spawnConfetti, gameState, isDebugMode]); // Added isDebugMode to dependencies
  // ***** END OF MODIFIED updateGame *****

  const updateConfetti = useCallback(() => {
    confettiRef.current.forEach(c => { c.y += c.speedY; c.swayCounter += 0.05; c.x += Math.sin(c.swayCounter) * c.sway; if (c.y > CANVAS_HEIGHT) { c.y = Math.random() * -100 - 20; c.x = Math.random() * CANVAS_WIDTH; } });
  }, []);

  // ***** MODIFIED refinedDraw *****
  const refinedDraw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;

    // Clear canvas and draw background
    // Sky Gradient
    const skyGradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT * 0.8); // Gradient mostly for the sky part
    skyGradient.addColorStop(0, COLOR_SKY_TOP);
    skyGradient.addColorStop(1, COLOR_SKY_BOTTOM);
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw distant hills (simple static ones for parallax illusion)
    const hillY1 = CANVAS_HEIGHT - 150;
    const hillY2 = CANVAS_HEIGHT - 120;
    
    // Hills layer 1 (furthest)
    ctx.fillStyle = COLOR_DISTANT_HILL_2;
    ctx.beginPath();
    ctx.moveTo(-100 - (cameraXRef.current * 0.1) % 200, hillY1 + 20); // Slow parallax for distant hills
    ctx.quadraticCurveTo(50 - (cameraXRef.current * 0.1) % 200, hillY1 - 30, 200 - (cameraXRef.current * 0.1) % 200, hillY1 + 10);
    ctx.quadraticCurveTo(350 - (cameraXRef.current * 0.1) % 200, hillY1 + 50, 500 - (cameraXRef.current * 0.1) % 200, hillY1);
    ctx.quadraticCurveTo(650 - (cameraXRef.current * 0.1) % 200, hillY1 - 40, 800 - (cameraXRef.current * 0.1) % 200, hillY1 + 20);
    ctx.lineTo(800 - (cameraXRef.current * 0.1) % 200, CANVAS_HEIGHT);
    ctx.lineTo(-100 - (cameraXRef.current * 0.1) % 200, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();
    
    // Hills layer 2 (closer)
    ctx.fillStyle = COLOR_DISTANT_HILL_1;
    ctx.beginPath();
    ctx.moveTo(-50 - (cameraXRef.current * 0.2) % 300, hillY2 + 10); // Slightly faster parallax
    ctx.quadraticCurveTo(100 - (cameraXRef.current * 0.2) % 300, hillY2 - 40, 300 - (cameraXRef.current * 0.2) % 300, hillY2);
    ctx.quadraticCurveTo(500 - (cameraXRef.current * 0.2) % 300, hillY2 + 40, 700 - (cameraXRef.current * 0.2) % 300, hillY2 - 10);
    ctx.quadraticCurveTo(900 - (cameraXRef.current * 0.2) % 300, hillY2 - 50, CANVAS_WIDTH + 100 - (cameraXRef.current * 0.2) % 300, hillY2 + 30);
    ctx.lineTo(CANVAS_WIDTH + 100 - (cameraXRef.current * 0.2) % 300, CANVAS_HEIGHT);
    ctx.lineTo(-50 - (cameraXRef.current * 0.2) % 300, CANVAS_HEIGHT);
    ctx.closePath();
    ctx.fill();

    // Water
    ctx.fillStyle = COLOR_WATER; ctx.fillRect(0, CANVAS_HEIGHT - 50, CANVAS_WIDTH, 50);
    
    // Animate Waves
    const waveSpeed = 0.5; // Adjust for desired speed
    const waveOffset = (Date.now() / 1000 * waveSpeed * 30) % 60; // 30 is wave segment width, 60 for two full waves before repeat pattern

    ctx.fillStyle = COLOR_WAVE;
    for (let i = -1; i < CANVAS_WIDTH / 30 + 2; i++) { // Start i from -1 to ensure coverage when offset
        const waveBaseX = (i * 30 - waveOffset);
        // Ensure waveX wraps around correctly for a continuous animation
        const waveX = (waveBaseX % (CANVAS_WIDTH + 60)) - ( (waveBaseX < -60 && (CANVAS_WIDTH+60 !==0)) ? (CANVAS_WIDTH+60) : 0);
        if (waveX > CANVAS_WIDTH + 30) continue; // Don't draw if way off screen

        ctx.beginPath();
        ctx.moveTo(waveX, CANVAS_HEIGHT - 45);
        ctx.quadraticCurveTo(waveX + 7.5, CANVAS_HEIGHT - 55, waveX + 15, CANVAS_HEIGHT - 45);
        ctx.quadraticCurveTo(waveX + 22.5, CANVAS_HEIGHT - 35, waveX + 30, CANVAS_HEIGHT - 45);
        ctx.fill();
    }


    // Draw level elements (platforms, spikes, etc.)
    levelElementsRef.current.forEach(element => {
        const elementScreenX = element.x - cameraXRef.current;
        // Cull elements not in view
        if (elementScreenX + (element.width || element.size || 500) < -100 || elementScreenX > CANVAS_WIDTH + 100) { // Increased culling range for falling bridge
            // For falling bridge, ensure its planks are also checked or culled based on the main element's X
            if(element.type !== 'falling_bridge_structure') return;
        }

        if (element.type === 'platform' || element.type === 'bridge_post' || element.type === 'bridge_plank_active') {
            // Dirt part
            ctx.fillStyle = COLOR_PLATFORM_DIRT; // Base dirt color
            ctx.fillRect(elementScreenX, element.y + 10, element.width, element.height - 10); // Dirt below grass

            // Add some dirt texture
            ctx.fillStyle = 'rgba(0,0,0,0.07)'; // Darker speckles for dirt
            for (let i = 0; i < element.width / 4; i++) {
                ctx.beginPath();
                ctx.arc(
                    elementScreenX + Math.random() * element.width,
                    element.y + 10 + Math.random() * (element.height - 15),
                    Math.random() * 2 + 1, // speckle size
                    0, Math.PI * 2
                );
                ctx.fill();
            }
            
            if (element.type === 'platform') {
                const grassHeight = 30; // Increased grass height for a more lush look
                const topY = element.y;

                // Main grass body (slightly rounded top)
                ctx.fillStyle = COLOR_PLATFORM_GRASS;
                ctx.beginPath();
                ctx.moveTo(elementScreenX, topY + grassHeight); // Bottom-left of grass
                ctx.lineTo(elementScreenX, topY + 10); // Top-left (straight part)
                ctx.quadraticCurveTo(elementScreenX + element.width / 2, topY - 5, elementScreenX + element.width, topY + 10); // Rounded top
                ctx.lineTo(elementScreenX + element.width, topY + grassHeight); // Bottom-right of grass
                ctx.closePath();
                ctx.fill();

                // Add some grass blades / texture
                ctx.strokeStyle = 'rgba(0,0,0,0.25)'; // Darker shade for depth
                ctx.lineWidth = 1.5;
                const bladeHeight = 12;
                const bladeWidth = 4;
                for (let gx = 0; gx < element.width; gx += 6) {
                    const bladeLean = (Math.random() - 0.5) * 5;
                    ctx.beginPath();
                    ctx.moveTo(elementScreenX + gx - bladeLean, topY + grassHeight - Math.random()*5); // Start slightly within grass body
                    ctx.quadraticCurveTo(
                        elementScreenX + gx + bladeWidth / 2, topY + grassHeight - bladeHeight - Math.random() * 5,
                        elementScreenX + gx + bladeWidth + bladeLean, topY + grassHeight - Math.random()*5
                    );
                    ctx.stroke();
                }
                // Add a slight highlight to the top edge of the grass
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.beginPath();
                ctx.moveTo(elementScreenX + 2, topY + 10);
                ctx.quadraticCurveTo(elementScreenX + element.width / 2, topY - 3, elementScreenX + element.width - 2, topY + 10);
                ctx.fill();


            } else if (element.type === 'bridge_plank_active') {
                ctx.fillStyle = COLOR_BRIDGE_PLANK;
                ctx.fillRect(elementScreenX, element.y, element.width, element.height);
                // Add wood grain texture to bridge planks
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 1;
                for(let i = 0; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(elementScreenX + 5, element.y + element.height/2 + (i-1)*5 + Math.random()*2-1);
                    ctx.bezierCurveTo(
                        elementScreenX + element.width * 0.3, element.y + element.height/2 + (i-1)*6 + Math.random()*4-2,
                        elementScreenX + element.width * 0.7, element.y + element.height/2 + (i-1)*4 + Math.random()*4-2,
                        elementScreenX + element.width - 5, element.y + element.height/2 + (i-1)*5 + Math.random()*2-1
                    );
                    ctx.stroke();
                }
            } else if (element.type === 'bridge_post') {
                // More detailed bridge post
                ctx.fillStyle = '#654321'; // Darker wood for post
                ctx.fillRect(elementScreenX, element.y, element.width, element.height);
                
                // Highlights and shadows for a rounded look
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(elementScreenX + element.width * 0.1, element.y, element.width*0.3, element.height);
                ctx.fillStyle = 'rgba(0,0,0,0.1)';
                ctx.fillRect(elementScreenX + element.width * 0.6, element.y, element.width*0.3, element.height);

                // Top cap
                ctx.fillStyle = '#503010';
                ctx.fillRect(elementScreenX - 5, element.y, element.width + 10, 15);
                ctx.fillStyle = '#654321';
                ctx.fillRect(elementScreenX - 2, element.y+2, element.width + 4, 11);
            }
            
            if (element.hasSpike) {
                const spikeWidth = 30, spikeHeight = 30;
                const spikeX = elementScreenX + element.spikeRelativeX;
                const spikeY = element.y - spikeHeight;
                ctx.fillStyle = COLOR_SPIKE;
                ctx.beginPath();
                ctx.moveTo(spikeX, spikeY + spikeHeight);
                ctx.lineTo(spikeX + spikeWidth / 2, spikeY);
                ctx.lineTo(spikeX + spikeWidth, spikeY + spikeHeight);
                ctx.closePath(); ctx.fill();
            }
        
        // Drawing falling bridge planks
        } else if (element.type === 'falling_bridge_structure') {
            element.planks.forEach(plank => {
                if (plank.state === 'fallen') return;

                const plankWorldX = element.x + plank.relativeX;
                const plankScreenX = plankWorldX - cameraXRef.current;

                if (plankScreenX + plank.width < 0 || plankScreenX > CANVAS_WIDTH) return; // Cull individual planks

                let drawY = plank.originalY + plank.yOffset;
                let wobbleX = 0;
                if (plank.state === 'wiggling') {
                    wobbleX = (Math.sin(Date.now() / 50) * 3); // Adjust for wobble speed/amount
                }

                ctx.fillStyle = '#8B4513'; // Darker, more unstable looking wood
                ctx.fillRect(plankScreenX + wobbleX, drawY, plank.width, plank.height);
                
                // Simple texture for falling planks
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 0.5;
                for(let k=0; k < 2; k++){
                    ctx.beginPath();
                    ctx.moveTo(plankScreenX + wobbleX + 3, drawY + plank.height/2 + (k*5)-2.5 + Math.random()*1-0.5);
                    ctx.lineTo(plankScreenX + wobbleX + plank.width - 3, drawY + plank.height/2 + (k*5)-2.5 + Math.random()*1-0.5);
                    ctx.stroke();
                }
            });
        } else if (element.type === 'warning_sign') {
            const signSize = 50;
            ctx.fillStyle = '#FFCC00'; ctx.beginPath();
            ctx.moveTo(elementScreenX + signSize / 2, element.y);
            ctx.lineTo(elementScreenX + signSize, element.y + signSize * 0.866);
            ctx.lineTo(elementScreenX, element.y + signSize * 0.866);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#000000'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center';
            ctx.fillText('!', elementScreenX + signSize / 2, element.y + signSize * 0.65);
        } else if (element.type === 'finish_line') {
            const poleWidth = 10;
            ctx.fillStyle = '#777777';
            ctx.fillRect(elementScreenX, element.y, poleWidth, element.height);
            const squareSize = 10;
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 5; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? FINISH_LINE_COLOR_PRIMARY : FINISH_LINE_COLOR_SECONDARY;
                    ctx.fillRect(elementScreenX + poleWidth + c * squareSize, element.y + r * squareSize, squareSize, squareSize);
                }
            }
        }
    });

    // --- NEW CHICKEN DRAWING LOGIC ---
    const ch = chickenRef.current;
    const chickenScreenX = ch.worldX - cameraXRef.current;
    const chickenDrawY = ch.y; // Using ch.y directly

    // Define dimensions relative to chicken's width/height
    const bodyWidth = ch.width * 0.85; // Main body is slightly narrower than bounding box
    const bodyHeight = ch.height * 1.1; // Main body is slightly taller than bounding box height
    const cornerRadius = bodyWidth * 0.4;

    const combWidth = ch.width * 0.25;
    const combHeight = ch.height * 0.25;
    
    const beakLength = ch.width * 0.35;
    const beakVisualHeight = ch.height * 0.2; // Visual height of the beak triangle

    const eyeRadius = ch.width * 0.08;

    const wingMarkingWidth = ch.width * 0.35;
    const wingMarkingHeight = ch.height * 0.5;
    const wingMarkingColor = '#D1C4E9'; // Light lavender/grey

    const tailFeatherLength = ch.width * 0.3;
    const numTailFeathers = 3;

    const legSegmentLength = ch.height * 0.45; // Legs are a bit longer
    const footSize = ch.width * 0.2;
    const legThickness = ch.width * 0.1;

    ctx.save();
    // Translate to the center of the chicken's bounding box for rotation and drawing
    ctx.translate(chickenScreenX + ch.width / 2, chickenDrawY + ch.height / 2);

    // Body Tilt when in air
    let bodyTilt = 0;
    if (!ch.onGround) {
        bodyTilt = ch.vy * 0.012; // Tilt proportional to vertical velocity
        bodyTilt = Math.max(-Math.PI / 10, Math.min(Math.PI / 10, bodyTilt)); // Clamp tilt
    }
    ctx.rotate(bodyTilt);

    // 1. Main Body (Rounded Rectangle, taller than wide)
    // Drawn centered at (0,0) after translation
    ctx.fillStyle = COLOR_CHICKEN_BODY;
    ctx.beginPath();
    // Top-left starting point for path
    ctx.moveTo(-bodyWidth / 2 + cornerRadius, -bodyHeight / 2);
    // Top edge
    ctx.lineTo(bodyWidth / 2 - cornerRadius, -bodyHeight / 2);
    ctx.arcTo(bodyWidth / 2, -bodyHeight / 2, bodyWidth / 2, -bodyHeight / 2 + cornerRadius, cornerRadius);
    // Right edge
    ctx.lineTo(bodyWidth / 2, bodyHeight / 2 - cornerRadius);
    ctx.arcTo(bodyWidth / 2, bodyHeight / 2, bodyWidth / 2 - cornerRadius, bodyHeight / 2, cornerRadius);
    // Bottom edge
    ctx.lineTo(-bodyWidth / 2 + cornerRadius, bodyHeight / 2);
    ctx.arcTo(-bodyWidth / 2, bodyHeight / 2, -bodyWidth / 2, bodyHeight / 2 - cornerRadius, cornerRadius);
    // Left edge
    ctx.lineTo(-bodyWidth / 2, -bodyHeight / 2 + cornerRadius);
    ctx.arcTo(-bodyWidth / 2, -bodyHeight / 2, -bodyWidth / 2 + cornerRadius, -bodyHeight / 2, cornerRadius);
    ctx.closePath();
    ctx.fill();

    // 2. Comb
    ctx.fillStyle = COLOR_CHICKEN_COMB;
    const combX = 0; // Centered on top
    const combYOffset = -bodyHeight / 2 - combHeight * 0.05; // Position slightly above body
    ctx.beginPath();
    // Single lobe comb (upper half of an ellipse)
    ctx.ellipse(combX, combYOffset, combWidth / 2, combHeight / 2, 0, Math.PI, 2 * Math.PI, false);
    ctx.fill();
    
    // 3. Beak
    ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS;
    const beakOriginX = bodyWidth / 2 * 0.75; // Beak starts from front part of body
    const beakTipX = beakOriginX + beakLength;
    const beakMidY = -bodyHeight * 0.05; // Beak slightly higher on face
    ctx.beginPath();
    ctx.moveTo(beakOriginX, beakMidY - beakVisualHeight / 2); // Upper base of beak
    ctx.lineTo(beakTipX, beakMidY);                           // Tip of beak
    ctx.lineTo(beakOriginX, beakMidY + beakVisualHeight / 2); // Lower base of beak
    ctx.closePath();
    ctx.fill();

    // 4. Eye
    ctx.fillStyle = '#000000'; // Black
    const eyeX = bodyWidth * 0.20;  // Position on the "face"
    const eyeY = -bodyHeight * 0.22; // Higher on the head
    ctx.beginPath();
    ctx.arc(eyeX, eyeY, eyeRadius, 0, 2 * Math.PI);
    ctx.fill();

    // 5. Wing Marking (animated)
    ctx.save(); // Save context for wing's own transform
    const wingMarkingOriginX = -bodyWidth * 0.05; // Position on body side, slightly back
    const wingMarkingOriginY = bodyHeight * 0.08; // Slightly down from center
    const wingRotation = Math.sin(ch.wingPhase) * 0.12; // Subtle rotation for "flapping" illusion
    ctx.translate(wingMarkingOriginX, wingMarkingOriginY);
    ctx.rotate(wingRotation);
    ctx.fillStyle = wingMarkingColor;
    ctx.beginPath();
    // Ellipse for wing marking
    ctx.ellipse(0, 0, wingMarkingWidth / 2, wingMarkingHeight / 2, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore(); // Restore from wing marking's transform

    // 6. Tail Feathers (animated)
    ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS; // Yellow
    const tailBaseX = -bodyWidth / 2 * 0.9; // Position at the back of the chicken
    const tailBaseY = bodyHeight * 0.1;    // Slightly above vertical center of back
    const tailSway = Math.sin(ch.wingPhase * 0.9 + Math.PI / 2.5) * 0.12; // Sync with wing, different phase

    for (let i = 0; i < numTailFeathers; i++) {
        ctx.save(); // Save for individual feather transform
        ctx.translate(tailBaseX, tailBaseY);
        // Fan out feathers and apply sway
        const angleOffset = (i - (numTailFeathers - 1) / 2) * (Math.PI / 10); // Spread feathers
        ctx.rotate(angleOffset + tailSway);
        ctx.beginPath();
        // Simple triangular/leaf shape for feather
        ctx.moveTo(0, 0); // Base of feather at tailBase
        ctx.lineTo(-tailFeatherLength * 0.8, -tailFeatherLength * 0.25);
        ctx.lineTo(-tailFeatherLength, 0);
        ctx.lineTo(-tailFeatherLength * 0.8, tailFeatherLength * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.restore(); // Restore from individual feather's transform
    }
    
    ctx.restore(); // Restore from body tilt and main translation to chicken center

    // 7. Legs (Drawn after body, not affected by body tilt, relative to screen coordinates)
    // Attachment point relative to the chicken's bounding box bottom-center
    const legAttachPointY = chickenDrawY + ch.height * 0.9; // Y-coordinate for top of legs
    const legAttachOffsetX = ch.width * 0.22; // Horizontal offset from chicken's center for each leg

    ctx.strokeStyle = COLOR_CHICKEN_BEAK_LEGS;
    ctx.lineWidth = legThickness;
    ctx.lineCap = 'round';

    if (ch.onGround) {
        const stride = ch.width * 0.20; // Max forward/backward reach of a foot
        const stepHeight = ch.height * 0.1; // How high the foot lifts

        // Back Leg (visually, appears as chicken's far leg)
        const backLegPhase = ch.legPhase;
        const backLegHipX = chickenScreenX + ch.width / 2 - legAttachOffsetX;
        const backLegFootX = backLegHipX + Math.sin(backLegPhase) * stride;
        // Foot Y is base + length - lift amount (cos makes it go up and down)
        const backLegFootY = legAttachPointY + legSegmentLength - Math.abs(Math.cos(backLegPhase)) * stepHeight;
        
        ctx.beginPath();
        ctx.moveTo(backLegHipX, legAttachPointY); // Hip joint
        ctx.lineTo(backLegFootX, backLegFootY);   // Foot
        ctx.stroke();
        // Back Foot (simple line)
        ctx.beginPath();
        ctx.moveTo(backLegFootX - footSize / 2, backLegFootY);
        ctx.lineTo(backLegFootX + footSize / 2, backLegFootY);
        ctx.stroke();

        // Front Leg (visually, appears as chicken's near leg)
        const frontLegPhase = ch.legPhase + Math.PI; // Offset phase for alternating movement
        const frontLegHipX = chickenScreenX + ch.width / 2 + legAttachOffsetX;
        const frontLegFootX = frontLegHipX + Math.sin(frontLegPhase) * stride;
        const frontLegFootY = legAttachPointY + legSegmentLength - Math.abs(Math.cos(frontLegPhase)) * stepHeight;

        ctx.beginPath();
        ctx.moveTo(frontLegHipX, legAttachPointY); // Hip joint
        ctx.lineTo(frontLegFootX, frontLegFootY);   // Foot
        ctx.stroke();
        // Front Foot (simple line)
        ctx.beginPath();
        ctx.moveTo(frontLegFootX - footSize / 2, frontLegFootY);
        ctx.lineTo(frontLegFootX + footSize / 2, frontLegFootY);
        ctx.stroke();

    } else { // Legs when in air (dangling)
        const dangleAngle = Math.PI / 15; // Slight backward dangle angle
        const airLegLength = legSegmentLength * 1.05; // Slightly more extended

        // Back Leg (dangling)
        const backLegHipX = chickenScreenX + ch.width / 2 - legAttachOffsetX;
        const backLegFootX_Air = backLegHipX - Math.sin(dangleAngle) * airLegLength * 0.4;
        const backLegFootY_Air = legAttachPointY + Math.cos(dangleAngle) * airLegLength;
        ctx.beginPath();
        ctx.moveTo(backLegHipX, legAttachPointY);
        ctx.lineTo(backLegFootX_Air, backLegFootY_Air);
        ctx.stroke();
        ctx.beginPath(); // Foot
        ctx.moveTo(backLegFootX_Air - footSize / 2, backLegFootY_Air);
        ctx.lineTo(backLegFootX_Air + footSize / 2, backLegFootY_Air);
        ctx.stroke();

        // Front Leg (dangling)
        const frontLegHipX = chickenScreenX + ch.width / 2 + legAttachOffsetX;
        const frontLegFootX_Air = frontLegHipX - Math.sin(dangleAngle) * airLegLength * 0.2; // Slightly less offset
        const frontLegFootY_Air = legAttachPointY + Math.cos(dangleAngle) * airLegLength;
        ctx.beginPath();
        ctx.moveTo(frontLegHipX, legAttachPointY);
        ctx.lineTo(frontLegFootX_Air, frontLegFootY_Air);
        ctx.stroke();
        ctx.beginPath(); // Foot
        ctx.moveTo(frontLegFootX_Air - footSize / 2, frontLegFootY_Air);
        ctx.lineTo(frontLegFootX_Air + footSize / 2, frontLegFootY_Air);
        ctx.stroke();
    }
    ctx.lineCap = 'butt'; // Reset lineCap
    // --- END OF NEW CHICKEN DRAWING LOGIC ---

    // Draw UI elements and game state text (remains the same)
    ctx.fillStyle = COLOR_TEXT; 
    ctx.font = '24px Arial'; 
    ctx.textAlign = 'left'; 
    const micX = 20, micY = 30; 
    ctx.fillRect(micX, micY - 10, 10, 20); 
    ctx.beginPath(); 
    ctx.arc(micX + 5, micY - 10, 8, Math.PI, 2 * Math.PI); 
    ctx.fill(); 
    ctx.fillRect(micX + 2, micY + 10, 6, 10); 
    ctx.fillText(`Dist: ${score.toFixed(0)}m`, 70, 40);
    
    if (window.lastSoundVolume !== undefined) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, CANVAS_HEIGHT - 90, 300, 80);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`Sound Volume: ${Math.round(window.lastSoundVolume)}`, 20, CANVAS_HEIGHT - 70);
      ctx.fillText(`Walk Threshold: ${Math.round(window.effectiveThreshold)}`, 20, CANVAS_HEIGHT - 50);
      ctx.fillText(`Jump Threshold: ${Math.round(window.jumpThreshold)}`, 20, CANVAS_HEIGHT - 30);
    }
    
    if (gameState === 'gameOver') { 
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); 
      ctx.fillStyle = COLOR_TEXT; 
      ctx.font = '48px Arial'; 
      ctx.textAlign = 'center'; 
      ctx.fillText('Game Over!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 30); 
      ctx.font = '24px Arial'; 
      ctx.fillText(`Distance: ${score.toFixed(0)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20); 
      ctx.fillText('Click or Say Something to Retry', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 60);
    } else if (gameState === 'won') { 
      updateConfetti(); 
      confettiRef.current.forEach(c => { 
        ctx.fillStyle = c.color; 
        ctx.fillRect(c.x, c.y, c.size, c.size); 
      }); 
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); 
      const trophyX = CANVAS_WIDTH / 2, trophyY = CANVAS_HEIGHT / 2 - 80; 
      const trophyWidth = 80, trophyHeight = 100; 
      ctx.fillStyle = COLOR_TROPHY; 
      ctx.fillRect(trophyX - trophyWidth/2, trophyY + trophyHeight - 20, trophyWidth, 20); 
      ctx.fillRect(trophyX - 10, trophyY + trophyHeight - 40, 20, 20); 
      ctx.beginPath(); 
      ctx.moveTo(trophyX - trophyWidth/2, trophyY + trophyHeight - 40); 
      ctx.quadraticCurveTo(trophyX, trophyY - 20, trophyX + trophyWidth/2, trophyY + trophyHeight - 40); 
      ctx.lineTo(trophyX + trophyWidth/2 - 10, trophyY); 
      ctx.quadraticCurveTo(trophyX, trophyY - 10, trophyX - trophyWidth/2 + 10, trophyY); 
      ctx.closePath(); 
      ctx.fill(); 
      const cuteChickenSize = 40; 
      ctx.fillStyle = COLOR_CHICKEN_BODY; 
      ctx.beginPath(); 
      ctx.arc(trophyX, trophyY - cuteChickenSize/3, cuteChickenSize/2, 0, 2 * Math.PI); 
      ctx.fill(); 
      ctx.fillStyle = COLOR_CHICKEN_COMB; 
      ctx.beginPath(); 
      ctx.arc(trophyX, trophyY - cuteChickenSize/3 - cuteChickenSize/4, cuteChickenSize/5, Math.PI, 2*Math.PI); 
      ctx.fill(); 
      ctx.fillStyle = COLOR_CHICKEN_BEAK_LEGS; 
      ctx.beginPath(); 
      ctx.moveTo(trophyX + cuteChickenSize/2.5, trophyY - cuteChickenSize/3); 
      ctx.lineTo(trophyX + cuteChickenSize/2.5 + 8, trophyY - cuteChickenSize/3 + 3); 
      ctx.lineTo(trophyX + cuteChickenSize/2.5, trophyY - cuteChickenSize/3 + 6); 
      ctx.closePath(); 
      ctx.fill(); 
      ctx.strokeStyle = '#000000'; 
      ctx.lineWidth = 1; 
      ctx.beginPath(); 
      ctx.arc(trophyX - 8, trophyY - cuteChickenSize/2.8, 4, 0.25*Math.PI, 0.75*Math.PI); 
      ctx.stroke(); 
      ctx.beginPath(); 
      ctx.arc(trophyX + 8, trophyY - cuteChickenSize/2.8, 4, 0.25*Math.PI, 0.75*Math.PI); 
      ctx.stroke(); 
      ctx.fillStyle = COLOR_CHICKEN_BODY; 
      ctx.beginPath(); 
      ctx.ellipse(trophyX - cuteChickenSize/2, trophyY - cuteChickenSize/6, cuteChickenSize/3, cuteChickenSize/4, -0.3*Math.PI, 0, 2*Math.PI); 
      ctx.fill(); 
      ctx.beginPath(); 
      ctx.ellipse(trophyX + cuteChickenSize/2, trophyY - cuteChickenSize/6, cuteChickenSize/3, cuteChickenSize/4, 0.3*Math.PI, 0, 2*Math.PI); 
      ctx.fill(); 
      ctx.fillStyle = COLOR_TEXT; 
      ctx.font = '48px Arial'; 
      ctx.textAlign = 'center'; 
      ctx.fillText('You Won!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 50); 
      ctx.font = '24px Arial'; 
      ctx.fillText(`Final Distance: ${score.toFixed(0)}m`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 90); 
      ctx.fillText('Click or Say Something to Play Again', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 130);
    } else if (gameState === 'ready') { 
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; 
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT); 
      ctx.fillStyle = COLOR_TEXT; 
      ctx.font = '30px Arial'; 
      ctx.textAlign = 'center'; 
      if (isMicrophoneAllowed === null) { 
        ctx.fillText('Requesting microphone...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); 
      } else if (isMicrophoneAllowed === false) { 
        ctx.fillText('Mic denied. Click/Space for small jump.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2); 
      } else { 
        ctx.fillText('Make Sounds to Move & Jump!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 15); 
        ctx.fillText('Click or Say Loudly to Start.', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 25);
      } 
    }
  }, [gameState, score, isMicrophoneAllowed, updateConfetti, cameraXRef]);
  // ***** END OF MODIFIED refinedDraw *****

  const connectAudioFile = useCallback((file) => {
    if (!file) return;
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!audioElementRef.current) {
      const audioEl = document.createElement('audio');
      audioEl.controls = true;
      audioElementRef.current = audioEl;
      const container = document.getElementById('audioFileContainer');
      if (container) container.appendChild(audioEl);
    }
    const audioEl = audioElementRef.current;
    const objectURL = URL.createObjectURL(file);
    audioEl.src = objectURL;
    if (audioFileSourceRef.current) {
      audioFileSourceRef.current.disconnect();
    }
    if (!analyserRef.current) {
      const analyser = audioContextRef.current.createAnalyser();
      analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    audioFileSourceRef.current = audioContextRef.current.createMediaElementSource(audioEl);
    audioFileSourceRef.current.connect(analyserRef.current);
    // Connect analyser to destination ONLY IF using audio file and not mic simultaneously
    // to avoid double output or feedback if mic path also connects to destination.
    // For this game, analyser output isn't meant to be heard, just analyzed.
    // However, if the user wants to hear the file, connect to destination.
    analyserRef.current.connect(audioContextRef.current.destination); 
    
    setUseAudioFile(true);
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  }, []);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      // If switching from mic, stop mic tracks
      if (microphoneStreamRef.current && !useAudioFile) {
          microphoneStreamRef.current.getTracks().forEach(track => track.stop());
          microphoneStreamRef.current = null; // Clear ref
          if(analyserRef.current && audioContextRef.current && audioContextRef.current.state === 'running'){
            // It's tricky to disconnect a MediaStreamSource cleanly without errors if it's already gone.
            // The best way is to re-init analyser for the file.
          }
      }
      connectAudioFile(file);
    }
  }, [connectAudioFile, useAudioFile]);

  const toggleAudioSource = useCallback(async () => {
    if (useAudioFile) { // Switching FROM file TO mic
      if (audioFileSourceRef.current) {
        audioFileSourceRef.current.disconnect();
        audioFileSourceRef.current = null;
      }
      if(audioElementRef.current) {
          audioElementRef.current.pause();
          audioElementRef.current.src = ""; // Release file
      }
      // Disconnect analyser from destination if it was connected for the file
      if(analyserRef.current && audioContextRef.current && audioContextRef.current.destination){
        try {
          analyserRef.current.disconnect(audioContextRef.current.destination);
        } catch(e){
          console.warn("Error disconnecting analyser from destination (might be okay):", e);
        }
      }
      
      setUseAudioFile(false);
      setIsMicrophoneAllowed(null); // Reset to trigger re-init attempt
      await initAudio(); // Re-initialize microphone
      // Ensure context is running for the mic
      await ensureAudioContextRunning();

    }
    // Switching from mic to file is handled by handleFileSelect
  }, [useAudioFile, initAudio, ensureAudioContextRunning]);


  useEffect(() => {
    generateLevel();
    if (isMicrophoneAllowed === null && !useAudioFile) {
      initAudio().then(() => {
          if(gameState === 'loading') {
              setGameState('ready');
          }
      });
    } else if (gameState === 'loading') {
        setGameState('ready');
    }

    const keyStates = { ArrowLeft: false, ArrowRight: false, ArrowUp: false }; 

    const handleKeyDown = (e) => {
      if (isDebugMode) {
        if (e.code === 'ArrowLeft') keyStates.ArrowLeft = true;
        if (e.code === 'ArrowRight') keyStates.ArrowRight = true;
        if (e.code === 'ArrowUp' && chickenRef.current.onGround) {
          chickenRef.current.vy = MAX_JUMP_STRENGTH; // Stronger jump for debug
          keyStates.ArrowUp = true; // though up is more of an event
        }
      }
      if (e.code === 'Space') {
        if (gameState === 'playing' && chickenRef.current.onGround) {
          chickenRef.current.vy = MIN_JUMP_STRENGTH;
        } else if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
          startGame();
        }
      }
    };

    const handleKeyUp = (e) => {
      if (isDebugMode) {
        if (e.code === 'ArrowLeft') keyStates.ArrowLeft = false;
        if (e.code === 'ArrowRight') keyStates.ArrowRight = false;
        if (e.code === 'ArrowUp') keyStates.ArrowUp = false;
      }
    };

    // Apply debug movement based on keyStates in a way that integrates with game loop
    const applyDebugMovement = () => {
      if (isDebugMode && gameState === 'playing') {
        let newDebugVx = 0;
        if (keyStates.ArrowLeft) newDebugVx -= WALK_SPEED * 0.8; // Reduced debug walk speed
        if (keyStates.ArrowRight) newDebugVx += WALK_SPEED * 0.8; // Reduced debug walk speed
        chickenRef.current.debugVx = newDebugVx;
      }
    };

    let animationFrameIdDebug;
    const debugLoop = () => {
      applyDebugMovement();
      animationFrameIdDebug = requestAnimationFrame(debugLoop);
    };
    if (isDebugMode) {
      animationFrameIdDebug = requestAnimationFrame(debugLoop);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationFrameIdDebug) {
        cancelAnimationFrame(animationFrameIdDebug);
      }
      if (microphoneStreamRef.current) {
        microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        // audioContextRef.current.close().catch(e => console.error("Error closing audio context", e));
        // audioContextRef.current = null; // Potentially problematic if other parts still expect it
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateLevel, initAudio, useAudioFile, isDebugMode, gameState, startGame]);

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

  const handleCanvasClick = useCallback(async () => {
    if (gameState === 'ready' || gameState === 'gameOver' || gameState === 'won') {
      await startGame();
    } else if (gameState === 'playing' && chickenRef.current.onGround) {
      chickenRef.current.vy = MIN_JUMP_STRENGTH;
    }
  }, [gameState, startGame]);

  const handleSensitivityChange = (event) => { setBaseSoundThreshold(parseFloat(event.target.value)); };

  const toggleDebugMode = () => {
    setIsDebugMode(prev => !prev);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-800 p-4">
      <h1 className="text-3xl font-bold text-white mb-2">Chicken Voice Mover</h1>
      <div className="my-3 p-3 bg-gray-700 rounded-lg shadow">
        <label htmlFor="sensitivity" className="block text-sm font-medium text-gray-200 mb-1">
          Sound Sensitivity (Value: {baseSoundThreshold.toFixed(0)})
        </label>
        <input type="range" id="sensitivity" name="sensitivity" min="5" max="100" value={baseSoundThreshold}
          onChange={handleSensitivityChange} className="w-full h-2 bg-gray-500 rounded-lg appearance-none cursor-pointer"
          disabled={gameState === 'playing'} />
        <div className="flex justify-between text-xs text-gray-400 px-1">
            <span>Less Sensitive</span>
            <span>More Sensitive</span>
        </div>
      </div>
      
      <div className="my-3 p-3 bg-gray-700 rounded-lg shadow w-full max-w-lg">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-white font-medium">Game Settings</h3>
          <button 
            onClick={toggleDebugMode}
            className={`py-1 px-2 rounded text-sm ${isDebugMode ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}
            disabled={gameState === 'playing'}
          >
            {isDebugMode ? 'Disable Debug Controls' : 'Enable Debug Controls'}
          </button>
        </div>

        {isDebugMode && (
          <>
            <h4 className="text-white font-normal text-sm mt-3 mb-1">Test with Audio File (Debug Mode)</h4>
            <div className="flex flex-col gap-2">
              <input 
                type="file" 
                accept="audio/*" 
                onChange={handleFileSelect} 
                className="text-gray-200 text-sm"
                disabled={gameState === 'playing'}
              />
              <div id="audioFileContainer" className="flex flex-col items-center mt-2">
                 {/* Audio element will be appended here by connectAudioFile */}
              </div>
              {useAudioFile && (
                <button 
                  onClick={toggleAudioSource}
                  className="mt-2 bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded"
                  disabled={gameState === 'playing'}
                >
                  Switch Back to Microphone
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Debug Controls: Arrow Keys to Move/Jump (Left, Right, Up).
            </p>
          </>
        )}
        {!isDebugMode && (
             <p className="text-xs text-gray-400 mt-2">
                Enable Debug Controls to use arrow keys and audio file input for testing.
            </p>
        )}
      </div>
      
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
        className="border-4 border-gray-600 rounded-lg shadow-2xl bg-white"
        onClick={handleCanvasClick} />
      {isMicrophoneAllowed === false && gameState !== 'loading' && !useAudioFile && (
        <p className="text-red-400 mt-4"> Mic access denied. Space/Click for small jump (no forward move).</p>
      )}
      <p className="text-gray-300 mt-2 text-sm">
        { gameState === 'loading' ? 'Loading...' :
          useAudioFile ? 'Using audio file input. Play the file to move the bird!' :
          (gameState === 'ready' && isMicrophoneAllowed === null) ? 'Waiting for microphone permission...' :
          (isMicrophoneAllowed && gameState !== 'playing') ? 'Make soft sounds to walk, loud to jump & move! Click/Say Loudly to Start.' :
          isMicrophoneAllowed ? 'Make soft sounds to walk, loud sounds to jump further & higher!' :
          'Click/Space for small jump (no forward move). Mic not available.'}
      </p>
       <p className="text-xs text-gray-500 mt-1">Inspired by TikTok. Art & mechanics approximated.</p>
    </div>
  );
}