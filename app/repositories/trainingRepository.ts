import type { Snapshot } from "../domain/types";
import type { Command } from "../services/validation";
export interface TrainingRepository {
  snapshot(): Promise<Snapshot>;
  execute(command: Command): Promise<void>;
}
