import { getStatsDClient } from "@app/lib/utils/statsd";

export class DurationRecorder {
  private readonly startTimeMs: number;
  private readonly tags: string[];

  private constructor(startTimeMs: number, tags: string[] = []) {
    this.startTimeMs = startTimeMs;
    this.tags = tags;
  }

  static create(tags: string[] = []): DurationRecorder {
    return new DurationRecorder(performance.now(), tags);
  }

  child(additionalTags: string[]): DurationRecorder {
    return new DurationRecorder(this.startTimeMs, [
      ...this.tags,
      ...additionalTags,
    ]);
  }

  record(metricName: string): void {
    const durationMs = performance.now() - this.startTimeMs;
    getStatsDClient().distribution(metricName, durationMs, this.tags);
  }

  getElapsedMs(): number {
    return performance.now() - this.startTimeMs;
  }
}
