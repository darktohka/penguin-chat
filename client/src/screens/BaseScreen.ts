import { Container } from "pixi.js";
import { loadChrome } from "../pixi/assets";
import { createFooter, createTitle } from "./chrome";

/**
 * Shared base for the status and end screens: title artwork plus footer.
 */
export abstract class BaseScreen extends Container {
  async init(): Promise<void> {
    const { title, rocketsnail } = await loadChrome();
    this.addChild(createTitle(title));
    this.addChild(createFooter(rocketsnail));
  }
}
