export type Listener<T> = (payload: T) => void;

type AnyListener = (payload: never) => void;

export class Emitter<Events extends object> {
  private handlers = new Map<string, Set<AnyListener>>();

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events & string>(
    type: K,
    handler: Listener<Events[K]>,
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as unknown as AnyListener);
    return () => {
      this.handlers.get(type)?.delete(handler as unknown as AnyListener);
    };
  }

  /** Remove a previously added handler. */
  off<K extends keyof Events & string>(
    type: K,
    handler: Listener<Events[K]>,
  ): void {
    this.handlers.get(type)?.delete(handler as unknown as AnyListener);
  }

  protected emit<K extends keyof Events & string>(
    type: K,
    payload: Events[K],
  ): void {
    this.handlers.get(type)?.forEach((handler) => {
      (handler as unknown as Listener<Events[K]>)(payload);
    });
  }
}
