import { Container, Sprite, Text, type Texture } from "pixi.js";
import {
  COPYRIGHT_TEXT_COLOR,
  FOOTER_TEXT_GAP,
  FOOTER_Y,
  FONT_NARROW,
  GAME_VERSION,
  GAME_WIDTH,
  TITLE_POS,
  VERSION_TEXT_COLOR,
} from "../core/constants";

/** The title artwork shown on the title/status/end screens. */
export function createTitle(texture: Texture): Sprite {
  const title = new Sprite(texture);
  title.position.set(TITLE_POS.x, TITLE_POS.y);
  return title;
}

/**
 * The RocketSnail footer: logo, copyright line and version number.
 */
export function createFooter(rocketsnail: Texture): Container {
  const container = new Container();

  const logo = new Sprite(rocketsnail);
  logo.anchor.set(0.5, 1);
  container.addChild(logo);

  const copyright = new Text({
    text: "Copyright © 2000 RocketSnail Games, All Rights Reserved.",
    style: {
      fontFamily: FONT_NARROW,
      fontSize: 11,
      fill: COPYRIGHT_TEXT_COLOR,
      align: "center",
    },
  });
  copyright.anchor.set(0.5, 1);
  copyright.position.set(GAME_WIDTH / 2, FOOTER_Y);
  container.addChild(copyright);

  logo.position.set(
    GAME_WIDTH / 2,
    copyright.y - copyright.height - FOOTER_TEXT_GAP,
  );

  const version = new Text({
    text: `version ${GAME_VERSION}`,
    style: {
      fontFamily: FONT_NARROW,
      fontSize: 12,
      fill: VERSION_TEXT_COLOR,
      align: "right",
    },
  });
  version.anchor.set(1, 1);
  version.position.set(GAME_WIDTH - 10, FOOTER_Y);
  container.addChild(version);

  return container;
}
