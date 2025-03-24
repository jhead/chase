declare module "nexrad-level-2-data" {
  declare type ParserOptions = {
    logger: any;
  };

  declare type HighResData = {
    block_type: string;
    name: string;
    spare: number[];
    gate_count: number;
    first_gate: number;
    gate_size: number;
    rf_threshold: number;
    snr_threshold: number;
    control_flags: number;
    data_size: number;
    scale: number;
    offset: number;
    moment_data: number[];
  };

  declare class Level2Radar {
    constructor(file: Buffer | Level2Radar, options?: ParserOptions);

    getScans(): number;

    getAzimuth(): number[];
    getAzimuth(scan?: number): number;

    getHeader(scan?: number);

    getHighresReflectivity(): HighResData[];
    getHighresReflectivity(scan?: number): HighResData;

    getHighresVelocity(): HighResData[];
    getHighresVelocity(scan?: number): HighResData;

    getHighresSpectrum(): HighResData[];
    getHighresSpectrum(scan?: number): HighResData;

    getHighresDiffReflectivity(): HighResData[];
    getHighresDiffReflectivity(scan?: number): HighResData;

    getHighresDiffPhase(): HighResData[];
    getHighresDiffPhase(scan?: number): HighResData;

    getHighresCorrelationCoefficient(): HighResData[];
    getHighresCorrelationCoefficient(scan?: number): HighResData;
  }
}
