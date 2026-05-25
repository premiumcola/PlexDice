import { useMemo } from 'react';

const ACCENT = '#f5a623';

function useBuckets(data, min, max, bucketCount) {
  return useMemo(() => {
    const bucketSize = (max - min) / bucketCount;
    const counts = new Array(bucketCount).fill(0);
    data.forEach((v) => {
      if (v == null || v < min || v > max) return;
      const idx = Math.min(bucketCount - 1, Math.floor((v - min) / bucketSize));
      counts[idx] += 1;
    });
    return { buckets: counts, maxCount: Math.max(1, ...counts) };
  }, [data, min, max, bucketCount]);
}

// Compact, read-only distribution bars (used in the collapsed filter preview).
export function MiniHistogram({ data, min, max, valueMin, valueMax, bucketCount = 30, accent = ACCENT }) {
  const { buckets, maxCount } = useBuckets(data, min, max, bucketCount);
  const range = max - min;

  return (
    <div className="flex items-end gap-[1px] h-7 w-full">
      {buckets.map((c, i) => {
        const bucketStart = min + (range * i) / bucketCount;
        const bucketEnd = min + (range * (i + 1)) / bucketCount;
        const active = bucketEnd > valueMin && bucketStart < valueMax;
        const height = (c / maxCount) * 100;
        return (
          <div
            key={i}
            className="flex-1 rounded-t-[1px]"
            style={{ height: `${Math.max(8, height)}%`, background: active ? accent : 'rgba(82,82,91,0.4)' }}
          />
        );
      })}
    </div>
  );
}

// Histogram with a dual-handle range slider underneath.
export function HistogramRange({
  data,
  min,
  max,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  bucketCount = 24,
  formatValue,
  step = 1,
  accent = ACCENT,
}) {
  const { buckets, maxCount } = useBuckets(data, min, max, bucketCount);
  const range = max - min;
  const minPct = ((valueMin - min) / range) * 100;
  const maxPct = ((valueMax - min) / range) * 100;

  return (
    <div className="select-none">
      <div className="flex items-end gap-[2px] h-14 mb-1.5 px-[10px]">
        {buckets.map((c, i) => {
          const bucketStart = min + (range * i) / bucketCount;
          const bucketEnd = min + (range * (i + 1)) / bucketCount;
          const active = bucketEnd > valueMin && bucketStart < valueMax;
          const height = (c / maxCount) * 100;
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-colors duration-150"
              style={{
                height: `${Math.max(3, height)}%`,
                background: active ? accent : 'rgba(82,82,91,0.55)',
                opacity: active ? 0.85 : 1,
              }}
            />
          );
        })}
      </div>

      <div className="dual-range relative h-9 px-[10px]">
        <div className="absolute top-1/2 left-[10px] right-[10px] h-1 -translate-y-1/2 rounded-full bg-zinc-700/60" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{
            left: `calc(10px + ${minPct}% - ${minPct * 0.2}px)`,
            right: `calc(10px + ${100 - maxPct}% - ${(100 - maxPct) * 0.2}px)`,
            background: accent,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMin}
          onChange={(e) => onChangeMin(Math.min(valueMax - step, parseFloat(e.target.value)))}
          className="dual-range-input"
          style={{ zIndex: valueMin > max - range * 0.1 ? 3 : 2 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={valueMax}
          onChange={(e) => onChangeMax(Math.max(valueMin + step, parseFloat(e.target.value)))}
          className="dual-range-input"
          style={{ zIndex: 3 }}
        />
      </div>

      <div className="flex justify-between text-xs text-zinc-300 mt-1 px-1 font-mono">
        <span>{formatValue ? formatValue(valueMin) : valueMin}</span>
        <span>{formatValue ? formatValue(valueMax) : valueMax}</span>
      </div>
    </div>
  );
}
