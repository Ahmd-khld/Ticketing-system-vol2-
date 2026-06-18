import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import api from '../api';

const GAME_WIDTH = 400;
const GAME_HEIGHT = 500;
const BASKET_WIDTH = 80;
const BASKET_HEIGHT = 20;
const ITEM_SIZE = 30;

// Moved outside to prevent array recreation/garbage collection 60 times a second
const GAME_ITEM_TYPES = [
  { emoji: '🌱', value: 5 },
  { emoji: '🌸', value: 5 },
  { emoji: '🐛', value: -10 },
];

const GamePage = () => {
  const [gameState, setGameState] = useState('loading');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [trialsUsed, setTrialsUsed] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [leaderboard, setLeaderboard] = useState([]);
  const [isCopied, setIsCopied] = useState(false);

  // Physics & Game Loop References
  const itemsRef = useRef([]);
  const scoreRef = useRef(0);
  const basketPosRef = useRef(GAME_WIDTH / 2 - BASKET_WIDTH / 2);
  const gameActiveRef = useRef(false);
  const requestRef = useRef();
  const lastSpawnTimeRef = useRef(0);

  // Rendering States (updated inside RAF)
  const [renderItems, setRenderItems] = useState([]);
  const [renderBasketPos, setRenderBasketPos] = useState(GAME_WIDTH / 2 - BASKET_WIDTH / 2);

  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const fetchLeaderboard = async () => {
    try {
      const res = await api.get('/game/leaderboard', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      setLeaderboard(res.data);
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    }
  };

  // 1. Fetch Status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get('/game/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.data;
        setTrialsUsed(data.trialsUsed);
        if (!data.canPlay) {
          setGameState('limit-reached');
        } else {
          setGameState('instructions');
        }
      } catch (err) {
        console.error('Failed to fetch status:', err);
      }
    };
    fetchStatus();
    fetchLeaderboard();
  }, [token]);

  // 2. Strict Real-Time Clock
  useEffect(() => {
    let timer;
    if (gameState === 'playing' && gameActiveRef.current) {
      timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            gameActiveRef.current = false;
            handleLose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState]);

  // 3. Keyboard & Touch Input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return;
      if (e.key === 'ArrowLeft') {
        basketPosRef.current = Math.max(0, basketPosRef.current - 35);
      } else if (e.key === 'ArrowRight') {
        basketPosRef.current = Math.min(GAME_WIDTH - BASKET_WIDTH, basketPosRef.current + 35);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState]);

  const moveLeft = () => {
    if (gameState !== 'playing') return;
    basketPosRef.current = Math.max(0, basketPosRef.current - 45);
  };

  const moveRight = () => {
    if (gameState !== 'playing') return;
    basketPosRef.current = Math.min(GAME_WIDTH - BASKET_WIDTH, basketPosRef.current + 45);
  };

  // 4. Main Animation Loop (Movement, Difficulty, Collision)
  const gameLoop = (time) => {
    if (!gameActiveRef.current) return;

    // Formula: Difficulty increases as time decreases
    const elapsed = 60 - timeLeft;
    const currentSpeed = 3.5 + elapsed * 0.12;
    const spawnInterval = Math.max(150, 400 - elapsed * 4.16);

    // Spawning
    if (time - lastSpawnTimeRef.current > spawnInterval) {
      const selected = GAME_ITEM_TYPES[Math.floor(Math.random() * GAME_ITEM_TYPES.length)];
      itemsRef.current.push({
        id: Math.random(),
        x: Math.random() * (GAME_WIDTH - ITEM_SIZE),
        y: -ITEM_SIZE,
        ...selected,
      });
      lastSpawnTimeRef.current = time;
    }

    // Movement & Collision & Cleanup
    const nextItems = [];
    itemsRef.current.forEach((item) => {
      item.y += currentSpeed;

      const isCaught =
        item.y + ITEM_SIZE > GAME_HEIGHT - BASKET_HEIGHT &&
        item.x + ITEM_SIZE > basketPosRef.current &&
        item.x < basketPosRef.current + BASKET_WIDTH;

      if (isCaught) {
        scoreRef.current = Math.max(0, scoreRef.current + item.value);
        setScore(scoreRef.current);
        // Trigger Win Check
        if (scoreRef.current >= 100) {
          gameActiveRef.current = false;
          handleWin();
        }
      } else if (item.y < GAME_HEIGHT) {
        nextItems.push(item);
      }
    });
    itemsRef.current = nextItems;

    // Sync to UI
    setRenderItems(nextItems); // nextItems is already a new array, no need to spread!
    setRenderBasketPos(basketPosRef.current);

    requestRef.current = requestAnimationFrame(gameLoop);
  };

  const handleWin = async () => {
    setGameState('loading');
    try {
      const res = await api.post(
        '/game/win',
        { score: scoreRef.current },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = res.data;
      setPromoCode(data.code);
      setGameState('won');
      fetchLeaderboard(); // Refresh scores so the user can see their rank update
    } catch (err) {
      console.error('Win Error:', err);
      if (err.response && err.response.status === 400) {
        setGameState('limit-reached');
      } else {
        alert('An error occurred while saving your score. Please try again later.');
        setGameState('instructions');
      }
    }
  };

  const handleLose = async () => {
    setGameState('loading');
    try {
      await api.post(
        '/game/lose',
        { score: scoreRef.current },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setGameState('lost');
      const statusRes = await api.get('/game/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const statusData = statusRes.data;
      setTrialsUsed(statusData.trialsUsed);
      fetchLeaderboard(); // Refresh scores so the user can see their rank update
    } catch (err) {
      console.error('Lose Error:', err);
      if (err.response && err.response.status === 400) {
        setGameState('limit-reached');
      } else {
        alert('An error occurred while saving your score. Please try again later.');
        setGameState('instructions');
      }
    }
  };

  const startGame = () => {
    scoreRef.current = 0;
    setScore(0);
    setTimeLeft(60);
    itemsRef.current = [];
    gameActiveRef.current = true;
    setGameState('playing');
    lastSpawnTimeRef.current = performance.now();
    requestRef.current = requestAnimationFrame(gameLoop);
  };

  useEffect(() => {
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, []);

  if (gameState === 'loading') {
    return (
      <div className="min-h-screen bg-smart-bg dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-smart-light"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-smart-bg dark:bg-gray-900 p-6 flex flex-col items-center transition-colors duration-500">
      <h1 className="text-4xl font-black text-smart-dark dark:text-smart-glow mb-8 uppercase tracking-widest italic">
        Garden Catcher
      </h1>

      {gameState === 'limit-reached' && (
        <div className="max-w-md text-center p-10 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border-2 border-smart-glow/20">
          <div className="text-6xl mb-6">⏳</div>
          <h2 className="text-2xl font-bold mb-4 dark:text-white">Monthly Limit Reached</h2>
          <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
            You've used your 3 attempts this month! Come back next month to win more discounts.
          </p>
          <button
            onClick={() => navigate('/book')}
            className="w-full bg-smart-dark text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-black transition-colors"
          >
            Book Tickets
          </button>

          {leaderboard.length > 0 && (
            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6 w-full">
              <h3 className="text-sm font-black mb-4 dark:text-white uppercase tracking-widest text-smart-light">
                Top Players
              </h3>
              <div className="space-y-2 text-sm text-left">
                {leaderboard.map((user, idx) => (
                  <div
                    key={user._id || idx}
                    className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-600"
                  >
                    <span className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                      {idx + 1}. {user.name}
                    </span>
                    <span className="font-black text-smart-light">
                      {user.gameStats?.topScore || 0}{' '}
                      <span className="text-[10px] text-gray-400">PTS</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {gameState === 'instructions' && (
        <div className="max-w-md text-center p-10 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border-2 border-smart-light/20">
          <div className="text-6xl mb-6">🌿</div>
          <h2 className="text-2xl font-bold mb-4 dark:text-white uppercase tracking-tight">
            How to Play
          </h2>
          <div className="text-left space-y-4 text-gray-600 dark:text-gray-300 mb-8 font-medium">
            <p className="flex items-center gap-3">
              🌱 🌸 <span className="flex-grow">Catch for +5 points</span>
            </p>
            <p className="flex items-center gap-3">
              🐛 <span className="flex-grow text-red-500 font-bold">Avoid! -10 points</span>
            </p>
            <p className="flex items-center gap-3">
              🎯 <span className="flex-grow">Goal: 100 points in 60s</span>
            </p>
            <p className="flex items-center gap-3 text-smart-light font-bold">
              ⚠️ Difficulty increases as time passes!
            </p>
            <p className="pt-2 text-center font-bold text-smart-light border-t border-smart-light/10 mt-4">
              {3 - trialsUsed} attempts remaining
            </p>
          </div>
          <button
            onClick={startGame}
            className="w-full bg-smart-light text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-smart-dark transition-all transform hover:scale-[1.02] shadow-lg"
          >
            Start Game
          </button>

          {leaderboard.length > 0 && (
            <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6 w-full">
              <h3 className="text-sm font-black mb-4 dark:text-white uppercase tracking-widest text-smart-light">
                Top Players
              </h3>
              <div className="space-y-2 text-sm text-left">
                {leaderboard.map((user, idx) => (
                  <div
                    key={user._id || idx}
                    className="flex justify-between items-center bg-gray-50 dark:bg-gray-700/50 px-4 py-3 rounded-xl border border-gray-100 dark:border-gray-600"
                  >
                    <span className="font-bold text-gray-700 dark:text-gray-300 capitalize">
                      {idx + 1}. {user.name}
                    </span>
                    <span className="font-black text-smart-light">
                      {user.gameStats?.topScore || 0}{' '}
                      <span className="text-[10px] text-gray-400">PTS</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {gameState === 'playing' && (
        <div className="relative">
          <div className="flex justify-between items-center w-full mb-4 px-2 font-black text-xl text-smart-dark dark:text-smart-glow">
            <div className="flex flex-col">
              <span className="flex items-center gap-2">
                SCORE: <span className="text-2xl">{score}</span>
              </span>
              <button
                onClick={() => {
                  gameActiveRef.current = false;
                  navigate('/profile');
                }}
                className="text-red-400 hover:text-red-300 font-bold tracking-wide transition-colors text-[11px] uppercase mt-1 text-left"
              >
                QUIT GAME
              </button>
            </div>
            <span className="flex items-center gap-2">
              TIME: <span className="text-2xl text-red-500">{timeLeft}s</span>
            </span>
          </div>

          <GameArea 
            className="bg-gradient-to-br from-green-900 via-green-800 to-emerald-900 border-4 border-green-700/50 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.2)]"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }}
          >
            {renderItems.map((item) => (
              <GameItem
                key={item.id}
                style={{ 
                  transform: `translate3d(${item.x}px, ${item.y}px, 0)`,
                  transition: 'transform 0.1s linear'
                }}
              >
                {item.emoji}
              </GameItem>
            ))}
            <Basket style={{ 
              transform: `translate3d(${renderBasketPos}px, 0, 0)`,
              transition: 'transform 0.1s ease-out'
            }} />
            <div className="absolute inset-0 border-4 border-white/5 pointer-events-none rounded-xl" />
          </GameArea>
        </div>
      )}

      {gameState === 'won' && (
        <div className="max-w-md text-center p-10 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border-2 border-smart-glow/30">
          <div className="text-6xl mb-6">🎉</div>
          <h2 className="text-3xl font-black mb-4 text-smart-glow uppercase italic tracking-widest">
            Victory!
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6 font-medium">
            You've unlocked a 10% discount!
          </p>
          <div className="bg-smart-bg dark:bg-gray-700 p-6 rounded-2xl mb-8 border-2 border-dashed border-smart-light shadow-inner">
            <p className="text-xs uppercase tracking-widest text-gray-500 mb-2 font-bold">
              Your Promo Code (Valid for 24 Hours)
            </p>
            <div 
              className={`flex items-center justify-center space-x-4 cursor-pointer group p-2 rounded-xl transition-all ${isCopied ? 'bg-green-500/10' : 'hover:bg-smart-light/10'}`}
              onClick={() => {
                navigator.clipboard.writeText(promoCode);
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
              title="Click to copy"
            >
              <p className={`text-3xl font-black tracking-widest transition-colors ${isCopied ? 'text-green-600 dark:text-green-400' : 'text-smart-dark dark:text-white group-hover:text-smart-light'}`}>
                {promoCode}
              </p>
              <button 
                className={`p-2 rounded-lg transition-colors ${isCopied ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'text-smart-light/60 group-hover:text-smart-light bg-smart-light/10 group-hover:bg-smart-light/20'}`}
              >
                {isCopied ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                )}
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate('/book', { state: { wonPromoCode: promoCode } })}
            className="w-full bg-smart-light text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-smart-dark transition-all shadow-xl"
          >
            Book with Discount
          </button>
        </div>
      )}

      {gameState === 'lost' && (
        <div className="max-w-md text-center p-10 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl border-2 border-red-500/20">
          <div className="text-6xl mb-6">🥀</div>
          <h2 className="text-2xl font-bold mb-4 dark:text-white uppercase tracking-wider">
            Time's Up!
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-8">
            You scored {score} points. Try again next time!
          </p>
          {trialsUsed < 3 ? (
            <button
              onClick={startGame}
              className="w-full bg-smart-light text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-smart-dark transition-colors"
            >
              Try Again ({3 - trialsUsed} left)
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="w-full bg-smart-dark text-white py-4 rounded-xl font-bold uppercase tracking-widest hover:bg-black transition-colors"
            >
              Back to Home
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const GameArea = styled.div`
  width: ${GAME_WIDTH}px;
  height: ${GAME_HEIGHT}px;
  background: linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%);
  position: relative;
  overflow: hidden;
  border-radius: 24px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);
`;

const Basket = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  width: ${BASKET_WIDTH}px;
  height: ${BASKET_HEIGHT}px;
  background: #5d4037;
  border-radius: 0 0 12px 12px;
  transition: transform 0.1s ease-out; /* Hardware accelerated transition */
  &::after {
    content: '';
    position: absolute;
    top: -12px;
    left: 0;
    width: 100%;
    height: 12px;
    background: #8d6e63;
    border-radius: 12px 12px 0 0;
    box-shadow: inset 0 -2px 4px rgba(0, 0, 0, 0.2);
  }
`;

const GameItem = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  font-size: ${ITEM_SIZE}px;
  width: ${ITEM_SIZE}px;
  height: ${ITEM_SIZE}px;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  text-shadow: 2px 2px 2px rgba(0, 0, 0, 0.1); /* Vastly faster than drop-shadow filter */
  will-change: transform; /* Hint browser to prioritize this on the GPU */
`;

export default GamePage;
