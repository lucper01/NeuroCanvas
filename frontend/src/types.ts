export type Channel = { name: string; type: string; unit: string }
export type EventMark = { time: number; label: string; duration: number }
export type Step = { method: string; channels?: string[]; low?: number | null; high?: number | null; order?: number; frequency?: number; quality?: number }
export type RecordingInfo = {
  name: string; sfreq: number; duration: number; samples: number;
  channels: Channel[]; events: EventMark[]; history: Step[];
  source: string; warnings: string[]
}
export type LocalRecording = { info: RecordingInfo; raw: number[][]; processed: number[][] }
export type Trace = { name: string; unit?: string; type?: string; x: number[]; y: number[] }
export type Spectrum = { frequency: number[]; psd: number[]; unit: string; method: string; nperseg: number }
export type TimeFrequency = { frequency: number[]; time: number[]; power: number[][]; unit: string }
export type Evoked = { time: number[]; mean: number[]; sem: (number | null)[]; n: number; excluded: number; unit: string }
