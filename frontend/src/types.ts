export type Channel = { name: string; type: string; unit: string }
export type EventMark = { time: number; label: string; duration: number }
export type BadSegment = { start: number; end: number; reason: string }
export type QCWindow = { start: number; end: number; rms: number; std: number; ptp: number; max_step: number; relative_high_amplitude: boolean; relative_flat: boolean; manually_excluded: boolean }
export type QCReport = { channel_results: { name: string; type: string; unit: string; marked_bad: boolean; median_ptp: number; windows: QCWindow[] }[]; window_seconds: number; rules: Record<string,string>; warning: string }
export type Step = { method: string; channels?: string[]; low?: number | null; high?: number | null; order?: number; frequency?: number; quality?: number }
export type RecordingInfo = {
  name: string; sfreq: number; duration: number; samples: number;
  channels: Channel[]; events: EventMark[]; history: Step[];
  source: string; warnings: string[]; bad_channels?: string[]; bad_segments?: BadSegment[]
}
export type LocalRecording = { info: RecordingInfo; raw: number[][]; processed: number[][] }
export type Trace = { name: string; unit?: string; type?: string; x: number[]; y: number[] }
export type Spectrum = { frequency: number[]; psd: number[]; unit: string; method: string; nperseg: number }
export type TimeFrequency = { frequency: number[]; time: number[]; power: number[][]; unit: string }
export type Evoked = { time: number[]; mean: number[]; sem: (number | null)[]; n: number; excluded: number; unit: string }
