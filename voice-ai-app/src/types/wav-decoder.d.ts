declare module "wav-decoder" {
  type DecodeResult = {
    sampleRate: number;
    channelData: Float32Array[];
  };

  export function decode(buffer: ArrayBuffer | Buffer): Promise<DecodeResult>;
}
