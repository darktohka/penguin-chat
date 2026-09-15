import {
  ASSET_POP_SOUND,
  ASSET_SNOWCAT_OFF_SOUND,
  ASSET_SNOWCAT_ON_SOUND,
  EXTENDED,
} from "../core/constants";

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
    template.volume = 0.1;
  }
  const sound = template.cloneNode() as HTMLAudioElement;
  sound.volume = template.volume;
  void sound.play().catch(() => undefined);
}

const snowcatTemplates = new Map<string, HTMLAudioElement>();

/**
 * Play the snowcat on/off chime (north pole toggle). Resolves once playback
 * finishes, so the caller can refuse new toggle input while it is sounding.
 */
export function playSnowcatToggle(enabled: boolean): Promise<void> {
  const path = enabled ? ASSET_SNOWCAT_ON_SOUND : ASSET_SNOWCAT_OFF_SOUND;
  let template = snowcatTemplates.get(path);
  if (!template) {
    template = new Audio(path);
    template.preload = "auto";
    template.volume = 0.2;
    snowcatTemplates.set(path, template);
  }
  const sound = template.cloneNode() as HTMLAudioElement;
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    sound.addEventListener("ended", done, { once: true });
    sound.addEventListener("error", done, { once: true });
    void sound.play().catch(done);
  });
}
