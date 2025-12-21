import React, { useState, useCallback } from 'react';
import { TextureOverlay } from './components/TextureOverlay';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
import { PokerGame } from './components/PokerGame';
import { GameConfig } from './types';
import { DEFAULT_CONFIG } from './constants';

type ViewState = 'LOGIN' | 'SETUP' | 'GAME';

function App() {
    const [view, setView] = useState<ViewState>('LOGIN');
    const [isExiting, setIsExiting] = useState(false);
    
    const [user, setUser] = useState<string | null>(null);
    const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG);

    // Helper to handle the exit-animation-then-switch flow
    const transitionTo = useCallback((nextView: ViewState, callback?: () => void) => {
        setIsExiting(true);
        // Wait for CSS animation to finish (600ms matches the duration in components)
        setTimeout(() => {
            if (callback) callback();
            setView(nextView);
            setIsExiting(false);
        }, 600);
    }, []);

    const handleLogin = (username: string) => {
        // Transition: Login -> Setup
        transitionTo('SETUP', () => {
            setUser(username);
            setConfig(prev => ({ ...prev, playerName: username }));
        });
    };

    const handleStartGame = (newConfig: GameConfig) => {
        // Transition: Setup -> Game
        transitionTo('GAME', () => {
            setConfig(newConfig);
        });
    };

    const handleExitGame = () => {
        // Transition: Game -> Setup
        // Note: PokerGame doesn't have an explicit exit animation prop yet, 
        // effectively it will just fade out via React unmount or we could add one, 
        // but immediate switch is usually fine for "Quitting".
        // For smoothness, we just switch back.
        setView('SETUP');
    };

    return (
        <main className="w-full h-[100dvh] flex flex-col bg-[radial-gradient(circle_at_center,#35654d_0%,#13251d_100%)] text-[#e0e0e0] font-sans overflow-hidden relative selection:bg-[#d4af37] selection:text-black">
            <TextureOverlay />
            
            {/* View Container */}
            <div className="relative w-full h-full z-10">
                {view === 'LOGIN' && (
                    <LoginPage 
                        onLogin={handleLogin} 
                        isExiting={isExiting} 
                    />
                )}

                {view === 'SETUP' && (
                    <LandingPage 
                        onStartGame={handleStartGame} 
                        username={user} 
                        isExiting={isExiting}
                    />
                )}

                {view === 'GAME' && (
                    <PokerGame 
                        config={config} 
                        onExit={handleExitGame} 
                    />
                )}
            </div>
        </main>
    );
}

export default App;