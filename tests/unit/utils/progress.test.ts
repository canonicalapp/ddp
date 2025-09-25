/**
 * Unit tests for progress indicator utility
 */

import {
  ProgressIndicator,
  createProgress,
  logProgress,
  withProgress,
} from '@/utils/progress';

// Mock process.stdout.write
const originalStdoutWrite = process.stdout.write;
const mockStdoutWrite = jest.fn();

describe('ProgressIndicator', () => {
  beforeEach(() => {
    process.stdout.write = mockStdoutWrite;
    mockStdoutWrite.mockClear();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe('Basic Functionality', () => {
    it('should create progress indicator with correct total', () => {
      const progress = new ProgressIndicator({ total: 100 });
      expect(progress).toBeInstanceOf(ProgressIndicator);
    });

    it('should update progress correctly', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(5);
      expect(mockStdoutWrite).toHaveBeenCalled();

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('5/10');
      expect(output).toContain('50%');
    });

    it('should not exceed total', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(15);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('10/10');
      expect(output).toContain('100%');
    });

    it('should set current value correctly', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.setCurrent(7);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('7/10');
      expect(output).toContain('70%');
    });

    it('should complete progress', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.complete();

      expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
    });
  });

  describe('Progress Bar', () => {
    it('should display progress bar correctly', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('[');
      expect(output).toContain(']');
      expect(output).toContain('█');
      expect(output).toContain('░');
    });

    it('should show correct filled length', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(3);

      const output = mockStdoutWrite.mock.calls[0][0];
      // Should have 9 filled blocks (30% of 30)
      const filledBlocks = (output.match(/█/g) || []).length;
      expect(filledBlocks).toBe(9);
    });
  });

  describe('Options', () => {
    it('should show percentage by default', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('50%');
    });

    it('should hide percentage when disabled', () => {
      const progress = new ProgressIndicator({
        total: 10,
        showPercentage: false,
      });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).not.toContain('%');
    });

    it('should show time by default', () => {
      const progress = new ProgressIndicator({ total: 10 });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('elapsed');
    });

    it('should hide time when disabled', () => {
      const progress = new ProgressIndicator({
        total: 10,
        showTime: false,
      });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).not.toContain('elapsed');
    });

    it('should use custom title', () => {
      const progress = new ProgressIndicator({
        total: 10,
        title: 'Custom Title',
      });

      progress.update(5);

      const output = mockStdoutWrite.mock.calls[0][0];
      expect(output).toContain('Custom Title:');
    });
  });

  describe('Update Interval', () => {
    it('should respect update interval', () => {
      const progress = new ProgressIndicator({
        total: 10,
        updateInterval: 1000,
      });

      progress.update(1);
      progress.update(2);

      // Should only call once due to interval
      expect(mockStdoutWrite).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createProgress', () => {
  it('should create progress indicator', () => {
    const progress = createProgress({ total: 10 });
    expect(progress).toBeInstanceOf(ProgressIndicator);
  });
});

describe('logProgress', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should log progress message', () => {
    logProgress('Processing', 5, 10);

    expect(consoleSpy).toHaveBeenCalledWith('Processing (5/10 - 50%)');
  });
});

describe('withProgress', () => {
  let mockProcessor: jest.Mock;

  beforeEach(() => {
    mockProcessor = jest.fn().mockResolvedValue(undefined);
    process.stdout.write = mockStdoutWrite;
    mockStdoutWrite.mockClear();
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  it('should process items with progress', async () => {
    const items = [1, 2, 3, 4, 5];

    await withProgress(items, mockProcessor, {
      title: 'Processing',
      total: items.length,
    });

    expect(mockProcessor).toHaveBeenCalledTimes(5);
    expect(mockProcessor).toHaveBeenCalledWith(1, 0);
    expect(mockProcessor).toHaveBeenCalledWith(2, 1);
    expect(mockProcessor).toHaveBeenCalledWith(3, 2);
    expect(mockProcessor).toHaveBeenCalledWith(4, 3);
    expect(mockProcessor).toHaveBeenCalledWith(5, 4);

    // Should call complete at the end
    expect(mockStdoutWrite).toHaveBeenCalledWith('\n');
  });

  it('should handle errors in processor', async () => {
    const items = [1, 2, 3];
    const error = new Error('Processing failed');
    mockProcessor.mockRejectedValueOnce(error);

    await expect(withProgress(items, mockProcessor)).rejects.toThrow(
      'Processing failed'
    );
  });

  it('should use default options', async () => {
    const items = [1, 2];

    await withProgress(items, mockProcessor);

    expect(mockProcessor).toHaveBeenCalledTimes(2);
  });
});
