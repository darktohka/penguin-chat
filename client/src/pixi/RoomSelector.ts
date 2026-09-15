import { Container } from "pixi.js";
import {
  DEFAULT_ROOM_ID,
  RADIO_ROW_GAP,
  ROOMS,
} from "../core/constants";
import { RadioButton } from "./RadioButton";

/** Options for a `RoomSelector` group. */
export interface RoomSelectorOptions {
  /** Initially selected room id; defaults to `DEFAULT_ROOM_ID`. */
  roomId?: string;
  /** Fired when the user clicks an option (not on programmatic `select`). */
  onSelect?: (roomId: string) => void;
  /** Row spacing; defaults to `RADIO_ROW_GAP`. */
  gap?: number;
}

/**
 * The vertical room radio group shared by the setup and in-game screens.
 * The caller positions the whole group via `.position.set(x, firstRowCentreY)`.
 */
export class RoomSelector extends Container {
  private current: string;
  private readonly buttons = new Map<string, RadioButton>();

  constructor(private readonly options: RoomSelectorOptions) {
    super();
    this.current = options.roomId ?? DEFAULT_ROOM_ID;
    const gap = options.gap ?? RADIO_ROW_GAP;

    ROOMS.forEach((room, index) => {
      const radio = new RadioButton({
        label: room.name,
        selected: room.id === this.current,
        onChange: () => this.pick(room.id),
      });
      radio.position.set(0, index * gap);
      this.buttons.set(room.id, radio);
      this.addChild(radio);
    });
  }

  /** The currently selected room id. */
  get selectedRoomId(): string {
    return this.current;
  }

  /** Select a room programmatically WITHOUT firing `onSelect`. */
  select(roomId: string): void {
    this.current = roomId;
    for (const [id, radio] of this.buttons) radio.setSelected(id === roomId);
  }

  private pick(roomId: string): void {
    this.select(roomId);
    this.options.onSelect?.(roomId);
  }
}
