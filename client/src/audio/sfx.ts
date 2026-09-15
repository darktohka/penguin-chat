import { ASSET_POP_SOUND, EXTENDED } from "../core/constants";

let template: HTMLAudioElement | null = null;

/**
 * Play the penguin pop cue (SWF sound 111). No-op unless `EXTENDED`.
 *
 * The template element is created on first use - after the user's Play click -
 * so autoplay policies are satisfied; a rejected `.play()` (for example, a
 * backgrounded tab) is ignored.
 */
export function playPop(): void {
  if (!EXTENDED) return;
  if (!template) {
    template = new Audio(ASSET_POP_SOUND);
    template.preload = "auto";
    template.volume = 0.5;
  }
  const sound = template.cloneNode() as HTMLAudioElement;
  sound.volume = template.volume;
  void sound.play().catch(() => undefined);
}
