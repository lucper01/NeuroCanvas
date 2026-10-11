export type Channel = { name: string; type: string; unit: string }
export type TriggerDefinition = { code: number; meaning: string; conditions: string[] }
export type EventMark = { time: number; label: string; duration: number; code?: number; source?: string; uid?: string }
export type MappedTrigger = Omit<EventMark, 'code'> & { code: number | null; meaning: string; conditions: string[] }
export type TriggerPreview = { events: MappedTrigger[]; counts: Record<string, number>;
  short_rejected: number; interval_rejected: number; source_channel: string;
  sampling_rate: number; commit?: { committed: number; skipped_existing: number };
  metadata?: RecordingInfo }
export type ConditionEpochs = { condition: string; channel: string; n: number; excluded_bounds: number;
  excluded_manual: number; excluded_rejected?: number; exclude_rejected?: boolean; codes: Record<string,number>; time: number[]; mean: number[];
  sem: number[] | null; trial_time: number[];
  trials: { event_index: number; event_uid?: string; time: number; code: number | null;
    meaning: string; conditions: string[]; signal: number[];
    review_rejected?: boolean; review_reason?: string; rms?: number;
    ptp?: number; mean_amplitude?: number }[];
  unit: string; baseline: [number,number] | null; exclude_marked: boolean }
export type BadSegment = { start: number; end: number; reason: string }
export type QCWindow = { start: number; end: number; rms: number; std: number; ptp: number; max_step: number; relative_high_amplitude: boolean; relative_flat: boolean; manually_excluded: boolean }
export type QCReport = { channel_results: { name: string; type: string; unit: string; marked_bad: boolean; median_ptp: number; windows: QCWindow[] }[]; window_seconds: number; rules: Record<string,string>; warning: string }
export type Step = { method: string; channels?: string[]; low?: number | null; high?: number | null; order?: number; frequency?: number; quality?: number }
export type RecordingInfo = {
  name: string; sfreq: number; duration: number; samples: number;
  channels: Channel[]; events: EventMark[]; history: Step[];
  source: string; warnings: string[]; bad_channels?: string[]; bad_segments?: BadSegment[];
  trigger_definitions?: TriggerDefinition[]; trial_decisions?: TrialDecision[]
}
export type LocalRecording = { info: RecordingInfo; raw: number[][]; processed: number[][] }
export type Trace = { name: string; unit?: string; type?: string; x: number[]; y: number[] }
export type Spectrum = { frequency: number[]; psd: number[]; unit: string; method: string; nperseg: number }
export type TimeFrequency = { frequency: number[]; time: number[]; power: number[][]; unit: string }
export type Evoked = { time: number[]; mean: number[]; sem: (number | null)[]; n: number; excluded: number; unit: string }

export type TrialDecision = { event_uid: string; rejected: boolean; reason: string }
export type ConditionMetricRow = { condition: string; n: number; status: string;
  mean_amplitude?: number; peak_amplitude?: number; peak_latency_s?: number;
  auc?: number; unit?: string; codes?: Record<string,number>;
  excluded_bounds?: number; excluded_manual?: number; excluded_rejected?: number }
export type ConditionMetrics = { channel: string; tmin: number; tmax: number;
  baseline_end: number; measurement_window: [number,number];
  exclude_marked: boolean; exclude_rejected: boolean;
  conditions: ConditionMetricRow[]; warning: string }
