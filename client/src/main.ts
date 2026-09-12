import { Application } from "pixi.js";
import { GAME_HEIGHT, GAME_WIDTH, MAX_RESOLUTION } from "./core/constants";
import { initAssets } from "./pixi/assets";
import { App } from "./screens/App";

async function main(): Promise<void> {
  await initAssets();

  const container = document.getElementById("app");
  if (!container) throw new Error("Game container not found");

  const resolution = Math.min(MAX_RESOLUTION, window.devicePixelRatio);
  const app = new Application();
  await app.init({
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    antialias: true,
    backgroundColor: 0xffffff,
    resolution,
    autoDensity: true,
  });

  app.canvas.style.width = `${GAME_WIDTH}px`;
  app.canvas.style.height = `${GAME_HEIGHT}px`;
  container.appendChild(app.canvas);

  await new App(app, container).start();
}

void main();
