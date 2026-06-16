import type { Channel, ChannelPayload } from '../types';

export type StreamMessage = {
  channel: Channel;
  data: ChannelPayload | { error: string };
};

type Subscriber = (msg: StreamMessage) => void;

export class BroadcastHub {
  private subscribers = new Set<Subscriber>();
  private cache = new Map<Channel, ChannelPayload | { error: string }>();

  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  getSnapshot(): Map<Channel, ChannelPayload | { error: string }> {
    return new Map(this.cache);
  }

  publish(channel: Channel, data: ChannelPayload | { error: string }): void {
    this.cache.set(channel, data);
    const msg: StreamMessage = { channel, data };
    // Isolate each subscriber: a throwing or rejecting one (e.g. a closed SSE
    // stream) must not abort the fan-out to the others or leak a rejection.
    for (const fn of this.subscribers) {
      try {
        const result = fn(msg) as unknown;
        if (result instanceof Promise) result.catch(() => {});
      } catch {
        /* dead subscriber */
      }
    }
  }
}

export const hub = new BroadcastHub();
