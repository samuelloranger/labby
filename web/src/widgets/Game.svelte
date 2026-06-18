<script lang="ts">
  import { onMount } from 'svelte';
  import { Gamepad2 } from 'lucide-svelte';

  let { title }: { title: string } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;

  let snake = [{ x: 10, y: 10 }];
  let apple = { x: 15, y: 15 };
  let dx = 0;
  let dy = 0;
  let score = 0;
  let isGameOver = false;

  const gridSize = 20;
  const tileCount = 15; // 300 / 20 = 15

  function resetGame() {
    snake = [{ x: 10, y: 10 }];
    apple = { x: 15, y: 15 };
    dx = 0;
    dy = 0;
    score = 0;
    isGameOver = false;
  }

  function gameLoop() {
    if (isGameOver) return;
    setTimeout(() => {
      requestAnimationFrame(gameLoop);
      if (dx === 0 && dy === 0) return; // Not started yet

      const head = { x: snake[0].x + dx, y: snake[0].y + dy };

      // Wall collision
      if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        isGameOver = true;
        return;
      }

      // Self collision
      for (const segment of snake) {
        if (head.x === segment.x && head.y === segment.y) {
          isGameOver = true;
          return;
        }
      }

      snake.unshift(head);

      if (head.x === apple.x && head.y === apple.y) {
        score++;
        apple = {
          x: Math.floor(Math.random() * tileCount),
          y: Math.floor(Math.random() * tileCount)
        };
      } else {
        snake.pop();
      }

      draw();
    }, 1000 / 10); // 10 fps
  }

  function draw() {
    if (!ctx) return;
    // Clear canvas
    ctx.fillStyle = 'var(--bg)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw snake
    ctx.fillStyle = '#2ecc71';
    for (const segment of snake) {
      ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    }

    // Draw apple
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(apple.x * gridSize, apple.y * gridSize, gridSize - 2, gridSize - 2);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isGameOver) {
      if (e.key === 'Enter' || e.key === ' ') resetGame();
      return;
    }
    
    // Prevent default scrolling for arrow keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
    }

    switch (e.key) {
      case 'ArrowUp':
        if (dy === 1) break;
        dx = 0; dy = -1;
        break;
      case 'ArrowDown':
        if (dy === -1) break;
        dx = 0; dy = 1;
        break;
      case 'ArrowLeft':
        if (dx === 1) break;
        dx = -1; dy = 0;
        break;
      case 'ArrowRight':
        if (dx === -1) break;
        dx = 1; dy = 0;
        break;
    }
  }

  onMount(() => {
    ctx = canvas.getContext('2d');
    draw();
    requestAnimationFrame(gameLoop);
  });
</script>

<div class="card game-widget" tabindex="0" onkeydown={handleKeydown} role="application">
  <div class="h">
    <Gamepad2 size={16} />
    <h2>{title}</h2>
    <div class="score">Score: {score}</div>
  </div>

  <div class="game-container">
    <canvas
      bind:this={canvas}
      width="300"
      height="300"
    ></canvas>
    
    {#if dx === 0 && dy === 0 && !isGameOver}
      <div class="overlay">Press Arrow Keys to Start<br><small>(Click widget first to focus)</small></div>
    {/if}

    {#if isGameOver}
      <div class="overlay game-over">
        Game Over!<br>
        Score: {score}<br>
        <button onclick={resetGame}>Try Again</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .game-widget {
    outline: none;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .game-widget:focus-within {
    box-shadow: 0 0 0 2px var(--brand);
  }
  .h {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
  }
  .score {
    margin-left: auto;
    font-weight: bold;
    color: var(--text-muted);
  }
  .game-container {
    position: relative;
    width: 300px;
    height: 300px;
    background: var(--bg);
    border-radius: 6px;
    overflow: hidden;
  }
  canvas {
    display: block;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    text-align: center;
    font-weight: 500;
  }
  .game-over {
    background: rgba(0, 0, 0, 0.85);
  }
  button {
    margin-top: 10px;
    padding: 6px 12px;
    background: #2ecc71;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
