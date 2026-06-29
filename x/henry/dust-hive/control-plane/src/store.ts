import { z } from "zod";
import { type Bee, BeeSchema } from "./types";

// The fleet registry: which bees exist, who owns them, their preview URL and
// host state. Authoritative and persistent (a scaled-to-zero bee has no live
// state to derive from). Readable identically by all clients.
export interface BeeStore {
  list(): Promise<Bee[]>;
  get(id: string): Promise<Bee | null>;
  save(bee: Bee): Promise<void>;
  delete(id: string): Promise<void>;
}

export class InMemoryBeeStore implements BeeStore {
  private readonly bees = new Map<string, Bee>();

  list(): Promise<Bee[]> {
    return Promise.resolve([...this.bees.values()]);
  }

  get(id: string): Promise<Bee | null> {
    return Promise.resolve(this.bees.get(id) ?? null);
  }

  save(bee: Bee): Promise<void> {
    this.bees.set(bee.id, bee);
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.bees.delete(id);
    return Promise.resolve();
  }
}

const FileShape = z.object({ bees: z.array(BeeSchema) });

// File-backed store for the running server. Whole-file read/write — the pilot
// fleet is small and writes are infrequent (provision / reclaim / state
// transitions), so a single JSON file is simpler than a DB (GEN2).
export class FileBeeStore implements BeeStore {
  constructor(private readonly path: string) {}

  private async readAll(): Promise<Bee[]> {
    const file = Bun.file(this.path);
    if (!(await file.exists())) {
      return [];
    }
    const parsed = FileShape.safeParse(await file.json());
    return parsed.success ? parsed.data.bees : [];
  }

  private async writeAll(bees: Bee[]): Promise<void> {
    await Bun.write(this.path, JSON.stringify({ bees }, null, 2));
  }

  list(): Promise<Bee[]> {
    return this.readAll();
  }

  async get(id: string): Promise<Bee | null> {
    const bees = await this.readAll();
    return bees.find((b) => b.id === id) ?? null;
  }

  async save(bee: Bee): Promise<void> {
    const bees = await this.readAll();
    const next = bees.filter((b) => b.id !== bee.id);
    next.push(bee);
    await this.writeAll(next);
  }

  async delete(id: string): Promise<void> {
    const bees = await this.readAll();
    await this.writeAll(bees.filter((b) => b.id !== id));
  }
}
