/**
 * Progress indicator utility for long-running operations
 */

export interface ProgressOptions {
  total: number;
  title?: string;
  showPercentage?: boolean;
  showTime?: boolean;
  updateInterval?: number;
}

export class ProgressIndicator {
  private current: number = 0;
  private total: number;
  private title: string;
  private showPercentage: boolean;
  private showTime: boolean;
  private updateInterval: number;
  private startTime: number;
  private lastUpdate: number = 0;

  constructor(options: ProgressOptions) {
    this.total = options.total;
    this.title = options.title ?? 'Progress';
    this.showPercentage = options.showPercentage ?? true;
    this.showTime = options.showTime ?? true;
    this.updateInterval = options.updateInterval ?? 100; // Update every 100ms
    this.startTime = Date.now();
  }

  public update(increment: number = 1): void {
    this.current = Math.min(this.current + increment, this.total);
    this.render();
  }

  public setCurrent(current: number): void {
    this.current = Math.min(Math.max(current, 0), this.total);
    this.render();
  }

  public complete(): void {
    this.current = this.total;
    this.render();
    process.stdout.write('\n'); // New line after completion
  }

  private render(): void {
    const now = Date.now();
    if (
      now - this.lastUpdate < this.updateInterval &&
      this.current < this.total
    ) {
      return; // Skip rendering if too soon
    }
    this.lastUpdate = now;

    const percentage = Math.round((this.current / this.total) * 100);
    const barLength = 30;
    const filledLength = Math.round((this.current / this.total) * barLength);

    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    let output = `\r${this.title}: [${bar}] ${this.current}/${this.total}`;

    if (this.showPercentage) {
      output += ` (${percentage}%)`;
    }

    if (this.showTime) {
      const elapsed = Date.now() - this.startTime;
      const elapsedSeconds = Math.round(elapsed / 1000);

      if (this.current > 0) {
        const estimatedTotal = (elapsed / this.current) * this.total;
        const remaining = Math.max(0, estimatedTotal - elapsed);
        const remainingSeconds = Math.round(remaining / 1000);

        output += ` | ${elapsedSeconds}s elapsed`;
        if (remaining > 0) {
          output += `, ~${remainingSeconds}s remaining`;
        }
      } else {
        output += ` | ${elapsedSeconds}s elapsed`;
      }
    }

    process.stdout.write(output);
  }
}

/**
 * Create a progress indicator for a specific operation
 */
export function createProgress(options: ProgressOptions): ProgressIndicator {
  return new ProgressIndicator(options);
}

/**
 * Simple progress logging for operations that don't need a visual indicator
 */
export function logProgress(
  message: string,
  current: number,
  total: number
): void {
  const percentage = Math.round((current / total) * 100);
  console.log(`${message} (${current}/${total} - ${percentage}%)`);
}

/**
 * Progress tracking for async operations
 */
export async function withProgress<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<void>,
  options?: Partial<ProgressOptions>
): Promise<void> {
  const progress = createProgress({
    total: items.length,
    title: options?.title ?? 'Processing',
    ...options,
  });

  try {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item !== undefined) {
        await processor(item, i);
      }
      progress.update();
    }
    progress.complete();
  } catch (error) {
    progress.complete();
    throw error;
  }
}
