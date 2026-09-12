import { Assets, Container, Sprite, type Texture } from "pixi.js";
import { gsap } from "gsap";
import { ASSET_LOADING, SPINNER_STEP_SECONDS } from "../core/constants";
import { backEase } from "./easing";

/**
 * The rotating loading ring shown while connecting and loading the world.
 */
export async function createSpinner(): Promise<Container> {
  const container = new Container();
  const texture = await Assets.load<Texture>({
    alias: "loading",
    src: [...ASSET_LOADING],
  });
  const ring = new Sprite(texture);
  ring.anchor.set(0.5);
  container.addChild(ring);

  const timeline = gsap.timeline({ repeat: -1 });
  for (let step = 1; step <= 4; step++) {
    timeline.to(container, {
      rotation: (Math.PI / 2) * step,
      duration: SPINNER_STEP_SECONDS,
      ease: backEase(step % 2 === 1 ? -80 : 80),
    });
  }

  container.on("destroyed", () => timeline.kill());
  return container;
}
