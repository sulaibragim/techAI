// Step-by-step programming procedures, gathered live and kept SEPARATE from the
// audited key dataset (data/keys) so procedure edits never touch verified key facts.
// One row per vehicle generation, joined to a key profile by make/model/year.
export interface KeyProcedure {
  make: string;
  model: string;
  yearStart: number;
  yearEnd: number | null;
  onboard?: string | null;      // DIY self-program sequence if the car supports it
  addKey?: string;              // add a key when one working key is present
  allKeysLost?: string;         // approach with no working keys
  pinRequired?: boolean;
  pinSource?: string | null;    // OBD read / PIN by VIN / dealer / EEPROM …
  obdPort?: string | null;
  securityWait?: string | null;
  specialTool?: string | null;
  sources?: string[];
  confidence?: string;
  lastVerified?: string;
}

const modules = import.meta.glob('./procedures/*.json', { eager: true }) as Record<
  string,
  { default: KeyProcedure[] }
>;

export const PROCEDURES: KeyProcedure[] = Object.values(modules)
  .flatMap((m) => m.default ?? (m as unknown as KeyProcedure[]))
  .filter((r) => r && r.make && r.model);
