declare module 'plotly.js-dist-min' {
  const Plotly: {
    react: (node: HTMLElement, data: unknown[], layout: Record<string, unknown>, config?: Record<string, unknown>) => Promise<unknown>;
    purge: (node: HTMLElement) => void;
    downloadImage: (node: HTMLElement, opts: Record<string, unknown>) => Promise<unknown>;
    Plots: { resize: (node: HTMLElement) => void };
  };
  export default Plotly;
}
