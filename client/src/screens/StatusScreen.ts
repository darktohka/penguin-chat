import { Text } from 'pixi.js';
import { FONT_UI, SPINNER_POS, STATUS_TEXT_POS } from '../core/constants';
import { createSpinner } from '../pixi/Spinner';
import { BaseScreen } from './BaseScreen';

/**
 * A status screen with a message and the rotating loading ring, shown while
 * connecting and loading the world.
 */
export class StatusScreen extends BaseScreen {
  constructor(private readonly message: string) {
    super();
  }

  override async init(): Promise<void> {
    await super.init();

    const label = new Text({
      text: this.message,
      style: {
        fontFamily: FONT_UI,
        fontWeight: 'bold',
        fontSize: 15,
        fill: 0x000000,
        align: 'center',
      },
    });
    label.anchor.set(0.5);
    label.position.set(STATUS_TEXT_POS.x, STATUS_TEXT_POS.y);
    this.addChild(label);

    const spinner = await createSpinner();
    spinner.position.set(SPINNER_POS.x, SPINNER_POS.y);
    this.addChild(spinner);
  }
}
