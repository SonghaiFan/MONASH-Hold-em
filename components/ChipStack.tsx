import React, { useEffect, useRef } from 'react';
import Matter from 'matter-js';

interface ChipStackProps {
    amount: number;
}

const CHIP_RADIUS = 16; 

// Expanded Chip Colors for all Tiers
const CHIP_COLORS: Record<number, string> = {
    100000: '#6366f1', // Indigo ($100k)
    25000: '#06b6d4',  // Cyan ($25k)
    5000: '#94a3b8',   // Platinum ($5k)
    1000: '#d4af37',   // Gold ($1k)
    500: '#a855f7',    // Purple ($500)
    100: '#171717',    // Black ($100)
    25: '#22c55e',     // Green ($25)
    5: '#ef4444',      // Red ($5)
    1: '#e2e8f0',      // White/Grey ($1)
};

const DENOMINATIONS = [100000, 25000, 5000, 1000, 500, 100, 25, 5, 1];

// Helper to breakdown an amount into chip counts
const calculateChipCounts = (total: number) => {
    let remaining = total;
    const counts: { value: number; count: number }[] = [];
    const MAX_CHIPS_PER_BATCH = 60; 

    let batchCount = 0;
    for (const value of DENOMINATIONS) {
        if (remaining < 1) break; 
        if (batchCount >= MAX_CHIPS_PER_BATCH) break;

        const count = Math.floor(remaining / value);
        if (count > 0) {
            counts.push({ value, count });
            remaining -= count * value;
            batchCount += count;
        }
    }
    return counts;
};

export const ChipStack: React.FC<ChipStackProps> = ({ amount }) => {
    const sceneRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);
    const chipsRef = useRef<Matter.Body[]>([]);
    const prevAmountRef = useRef<number>(0);
    
    // Track container dimensions to handle resizing boundaries
    const dimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

    // --- 1. SETUP ENGINE (Run once) ---
    useEffect(() => {
        if (!sceneRef.current || !canvasRef.current) return;

        const Engine = Matter.Engine,
              World = Matter.World,
              Bodies = Matter.Bodies,
              Runner = Matter.Runner,
              Composite = Matter.Composite;

        const engine = Engine.create();
        const world = engine.world;
        engineRef.current = engine;

        const width = sceneRef.current.clientWidth;
        const height = sceneRef.current.clientHeight;
        dimensionsRef.current = { width, height };

        // Boundaries
        // Ground: centered at (width/2, height+60), height 120 -> Top edge at height (bottom of screen)
        const ground = Bodies.rectangle(width / 2, height + 60, width, 120, { isStatic: true, render: { visible: false } });
        const wallThickness = 100;
        const leftWall = Bodies.rectangle(0 - wallThickness/2, height / 2, wallThickness, height * 4, { isStatic: true, render: { visible: false } });
        const rightWall = Bodies.rectangle(width + wallThickness/2, height / 2, wallThickness, height * 4, { isStatic: true, render: { visible: false } });

        World.add(world, [ground, leftWall, rightWall]);

        // CLICK TO BUMP INTERACTION
        const handleCanvasInteract = (e: MouseEvent | TouchEvent) => {
            if (!engineRef.current || !canvasRef.current) return;
            
            const rect = canvasRef.current.getBoundingClientRect();
            
            let clientX, clientY;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else {
                // Prevent scrolling if touching chips (optional, but good for game feel)
                // e.preventDefault(); 
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            }

            // Map coordinates
            const x = clientX - rect.left;
            const y = clientY - rect.top;

            const bodies = Composite.allBodies(engine.world);
            const clickedBodies = Matter.Query.point(bodies, { x, y });

            clickedBodies.forEach(body => {
                if (body.isStatic) return;
                // Apply upward force ("Bump")
                const forceMag = 0.05 * body.mass;
                Matter.Body.applyForce(body, body.position, {
                    x: (Math.random() - 0.5) * forceMag * 0.5,
                    y: -forceMag
                });
            });
        };

        canvasRef.current.addEventListener('mousedown', handleCanvasInteract);
        canvasRef.current.addEventListener('touchstart', handleCanvasInteract);

        // Render Loop
        const ctx = canvasRef.current.getContext('2d');
        let animationFrameId: number;

        const renderLoop = () => {
            if (!ctx || !canvasRef.current) return;
            const currentWidth = sceneRef.current?.clientWidth || 0;
            const currentHeight = sceneRef.current?.clientHeight || 0;
            const dpr = window.devicePixelRatio || 1;
            
            // Calculate Physical Pixels (Backing Store) vs Logical CSS Pixels
            const displayWidth = Math.round(currentWidth * dpr);
            const displayHeight = Math.round(currentHeight * dpr);
            
            // Handle Resize
            if (canvasRef.current.width !== displayWidth || canvasRef.current.height !== displayHeight) {
                canvasRef.current.width = displayWidth;
                canvasRef.current.height = displayHeight;
                
                if (dimensionsRef.current.width !== currentWidth && dimensionsRef.current.width > 0) {
                     const scaleX = currentWidth / dimensionsRef.current.width;
                     Matter.Body.scale(ground, scaleX, 1);
                }

                Matter.Body.setPosition(ground, { x: currentWidth / 2, y: currentHeight + 60 });
                Matter.Body.setPosition(rightWall, { x: currentWidth + wallThickness/2, y: currentHeight / 2 });
                Matter.Body.setPosition(leftWall, { x: 0 - wallThickness/2, y: currentHeight / 2 });
                
                dimensionsRef.current = { width: currentWidth, height: currentHeight };
            }

            ctx.clearRect(0, 0, displayWidth, displayHeight);
            
            ctx.save();
            ctx.scale(dpr, dpr);
            
            const bodies = Composite.allBodies(engine.world);
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0,0,0,0.4)';
            ctx.shadowOffsetY = 4;

            bodies.forEach(body => {
                if (body.isStatic) return;
                const { x, y } = body.position;
                const radius = (body.circleRadius || CHIP_RADIUS);
                // @ts-ignore
                const chipValue = body.chipValue || 100;
                const color = CHIP_COLORS[chipValue] || '#fff';

                ctx.translate(x, y);
                ctx.rotate(body.angle);
                
                ctx.beginPath();
                ctx.arc(0, 0, radius, 0, 2 * Math.PI);
                ctx.fillStyle = color;
                ctx.fill();

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                ctx.lineWidth = 4;
                for(let i=0; i<6; i++) {
                    const angle = (i / 6) * Math.PI * 2;
                    ctx.moveTo(Math.cos(angle)*(radius-5), Math.sin(angle)*(radius-5));
                    ctx.lineTo(Math.cos(angle)*radius, Math.sin(angle)*radius);
                }
                ctx.stroke();

                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                ctx.arc(0, 0, radius - 5, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.beginPath();
                ctx.fillStyle = '#fff';
                ctx.arc(0, 0, radius * 0.55, 0, 2 * Math.PI);
                ctx.fill();

                ctx.fillStyle = '#000';
                ctx.font = 'bold 8px "Space Mono", monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let text = chipValue >= 1000 ? (chipValue/1000) + 'k' : chipValue.toString();
                ctx.fillText(text, 0, 0.5);

                ctx.rotate(-body.angle);
                ctx.translate(-x, -y);
            });
            
            ctx.restore();
            
            animationFrameId = requestAnimationFrame(renderLoop);
        };

        const runner = Runner.create();
        runnerRef.current = runner;
        Runner.run(runner, engine);
        renderLoop();

        return () => {
            if (canvasRef.current) {
                canvasRef.current.removeEventListener('mousedown', handleCanvasInteract);
                canvasRef.current.removeEventListener('touchstart', handleCanvasInteract);
            }
            cancelAnimationFrame(animationFrameId);
            Runner.stop(runner);
            World.clear(world, false);
            Engine.clear(engine);
        };
    }, []);

    // --- 2. HANDLE AMOUNT CHANGES (Diff Logic) ---
    useEffect(() => {
        if (!engineRef.current) return;
        const world = engineRef.current.world;
        const width = sceneRef.current?.clientWidth || 300;

        const prevAmount = prevAmountRef.current;
        const delta = amount - prevAmount;

        const spawnChips = (valueToSpawn: number) => {
            const breakdown = calculateChipCounts(valueToSpawn);
            const newBodies: Matter.Body[] = [];
            breakdown.forEach(({ value, count }) => {
                for (let i = 0; i < count; i++) {
                    const x = Math.random() * (width - 40) + 20;
                    const y = -100 - (Math.random() * 500); 
                    const body = Matter.Bodies.circle(x, y, CHIP_RADIUS, {
                        restitution: 0.5,
                        friction: 0.05,
                        density: 0.002,
                        // @ts-ignore
                        chipValue: value
                    });
                    newBodies.push(body);
                }
            });
            chipsRef.current = [...chipsRef.current, ...newBodies];
            Matter.World.add(world, newBodies);
        };

        if (delta > 0) {
            spawnChips(delta);
        } else if (delta < 0) {
            const target = Math.abs(delta);
            const currentBodies = [...chipsRef.current];

            const bodiesDesc = [...currentBodies].sort((a, b) => {
                // @ts-ignore
                return b.chipValue - a.chipValue;
            });
            
            const exactMatchToRemove: Matter.Body[] = [];
            let currentSum = 0;
            
            for (const body of bodiesDesc) {
                // @ts-ignore
                const val = body.chipValue;
                if (currentSum + val <= target) {
                    currentSum += val;
                    exactMatchToRemove.push(body);
                }
                if (currentSum === target) break;
            }

            if (currentSum === target) {
                Matter.World.remove(world, exactMatchToRemove);
                chipsRef.current = currentBodies.filter(b => !exactMatchToRemove.includes(b));
            } else {
                const bodiesAsc = [...currentBodies].sort((a, b) => {
                    // @ts-ignore
                    return a.chipValue - b.chipValue;
                });

                // @ts-ignore
                const singleBreaker = bodiesAsc.find(b => b.chipValue >= target);

                if (singleBreaker) {
                    Matter.World.remove(world, [singleBreaker]);
                    chipsRef.current = currentBodies.filter(b => b !== singleBreaker);
                    // @ts-ignore
                    const change = singleBreaker.chipValue - target;
                    if (change > 0) spawnChips(change);
                } else {
                    const multiBreakerToRemove: Matter.Body[] = [];
                    let breakSum = 0;
                    for (const body of bodiesAsc) {
                        multiBreakerToRemove.push(body);
                        // @ts-ignore
                        breakSum += body.chipValue;
                        if (breakSum >= target) break;
                    }

                    Matter.World.remove(world, multiBreakerToRemove);
                    chipsRef.current = currentBodies.filter(b => !multiBreakerToRemove.includes(b));
                    const change = breakSum - target;
                    if (change > 0) spawnChips(change);
                }
            }
        }

        prevAmountRef.current = amount;
    }, [amount]);

    return (
        <div ref={sceneRef} className="absolute inset-0 z-0 pointer-events-auto overflow-hidden">
            <canvas ref={canvasRef} className="block w-full h-full touch-none" />
        </div>
    );
};